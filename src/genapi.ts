import type { ApiPipeline } from '@genapi/shared'
import { basename, dirname, resolve } from 'node:path'
import ts from 'typescript'

const methods = new Set(['get', 'head', 'post', 'put', 'patch', 'delete', 'options'])
const diagnosticHost: ts.FormatDiagnosticsHost = {
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getCanonicalFileName: name => name,
  getNewLine: () => '\n',
}

export function original(configRead: ApiPipeline.ConfigRead): ApiPipeline.ConfigRead {
  if (!configRead.inputs.uri)
    throw new TypeError('dsh-h3/genapi: input must be a local service entry file')
  const entry = resolve(configRead.inputs.uri)
  const configFile = ts.findConfigFile(dirname(entry), ts.sys.fileExists)
  let options: ts.CompilerOptions = { strict: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.Preserve, moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true }
  if (configFile) {
    const loaded = ts.readConfigFile(configFile, ts.sys.readFile)
    if (loaded.error)
      throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, '\n'))
    const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, dirname(configFile))
    if (parsed.errors.length)
      throw new Error(ts.formatDiagnostics(parsed.errors, diagnosticHost))
    options = parsed.options
  }
  const program = ts.createProgram([entry], options)
  const file = program.getSourceFile(entry)
  if (!file)
    throw new Error(`dsh-h3/genapi: cannot read service entry ${entry}`)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  if (diagnostics.length)
    throw new Error(ts.formatDiagnostics(diagnostics, diagnosticHost))
  const checker = program.getTypeChecker()
  const typeScope = configRead.graphs.scopes.type
  if (!typeScope)
    throw new TypeError('dsh-h3/genapi: a TypeScript type output is required')
  const paths: Record<string, Record<string, unknown>> = {}
  let count = 0

  function fail(node: ts.Node, message: string): never {
    const source = node.getSourceFile()
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart())
    throw new TypeError(`dsh-h3/genapi: ${source.fileName}:${line + 1}:${character + 1}: ${message}`)
  }

  function symbolOf(node: ts.Node): ts.Symbol | undefined {
    const symbol = checker.getSymbolAtLocation(node)
    return symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
  }

  function nameOf(node: ts.Expression): string | undefined {
    return symbolOf(ts.isPropertyAccessExpression(node) ? node.name : node)?.getName()
  }

  function valueOf(node: ts.Expression, seen = new Set<ts.Symbol>()): ts.Expression | ts.FunctionDeclaration {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node))
      return valueOf(node.expression, seen)
    if (!ts.isIdentifier(node) && !ts.isPropertyAccessExpression(node))
      return node
    const symbol = symbolOf(ts.isPropertyAccessExpression(node) ? node.name : node)
    if (!symbol || seen.has(symbol))
      return node
    seen.add(symbol)
    const declaration = symbol.valueDeclaration
    if (!declaration)
      return node
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      if (!(declaration.parent.flags & ts.NodeFlags.Const))
        return fail(node, 'route bindings must be const')
      return valueOf(declaration.initializer, seen)
    }
    if (ts.isExportAssignment(declaration))
      return valueOf(declaration.expression, seen)
    return ts.isFunctionDeclaration(declaration) ? declaration : node
  }

  function textOf(node: ts.Expression): string {
    const value = valueOf(node)
    if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
      return value.text
    return fail(node, 'route paths and HTTP methods must be static strings')
  }

  function typeValue(type: ts.Type, node: ts.Node, seen = new Set<ts.Type>()): string {
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown))
      return 'unknown'
    if (type.flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral))
      return JSON.stringify((type as ts.StringLiteralType | ts.NumberLiteralType).value)
    if (type.isUnionOrIntersection())
      return `(${type.types.map(part => typeValue(part, node, seen)).join(type.isUnion() ? ' | ' : ' & ')})`
    if (type.flags & (ts.TypeFlags.TypeParameter | ts.TypeFlags.BigIntLike | ts.TypeFlags.ESSymbolLike))
      return fail(node, 'request and response contracts must be concrete JSON types')
    if (!(type.flags & ts.TypeFlags.Object))
      return checker.typeToString(type)
    if (type.getSymbol()?.getName() === 'Date')
      return 'string'
    if (seen.has(type))
      return fail(node, 'recursive contracts are not supported')
    const nested = new Set(seen).add(type)
    if (checker.isArrayType(type))
      return `(${typeValue(checker.getTypeArguments(type as ts.TypeReference)[0], node, nested)})[]`
    if (checker.isTupleType(type))
      return tupleValue(type as ts.TupleTypeReference, node, nested)
    if (type.getCallSignatures().length || type.getConstructSignatures().length)
      return fail(node, 'functions and class instances are not JSON contracts')
    const fields = checker.getPropertiesOfType(type).map((property) => {
      const value = typeValue(checker.getTypeOfSymbolAtLocation(property, node), node, nested)
      return `${JSON.stringify(property.getName())}${property.flags & ts.SymbolFlags.Optional ? '?' : ''}: ${value}`
    })
    for (const [kind, name] of [[ts.IndexKind.String, 'string'], [ts.IndexKind.Number, 'number']] as const) {
      const index = checker.getIndexTypeOfType(type, kind)
      if (index)
        fields.push(`[key: ${name}]: ${typeValue(index, node, nested)}`)
    }
    return `{ ${fields.join('; ')} }`
  }

  function tupleValue(tuple: ts.TupleTypeReference, node: ts.Node, seen: Set<ts.Type>): string {
    return `[${checker.getTypeArguments(tuple).map((part, index) => {
      const value = typeValue(part, node, seen)
      const flag = tuple.target.elementFlags[index]
      return flag & ts.ElementFlags.Rest ? `...(${value})[]` : flag & ts.ElementFlags.Optional ? `(${value})?` : value
    }).join(', ')}]`
  }

  function alias(name: string, type: ts.Type, node: ts.Node): { $ref: string } {
    typeScope.typings.push({ name, value: typeValue(type, node), export: true })
    return { $ref: `#/definitions/${name}` }
  }

  function handlerOf(node: ts.Expression): ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration {
    let value = valueOf(node)
    if (ts.isCallExpression(value) && ['defineEventHandler', 'defineHandler', 'eventHandler'].includes(nameOf(value.expression) ?? '')) {
      value = valueOf(value.arguments[0])
      if (ts.isObjectLiteralExpression(value)) {
        const handler = value.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText() === 'handler')
        if (handler && ts.isPropertyAssignment(handler))
          value = valueOf(handler.initializer)
      }
    }
    if ((ts.isArrowFunction(value) || ts.isFunctionExpression(value) || ts.isFunctionDeclaration(value)) && value.body && value.parameters.length < 2)
      return value
    return fail(node, 'use a statically resolvable H3 event handler, not a Node callback or sub-application')
  }

  function descriptorPath(route: ts.ObjectLiteralExpression): string {
    const properties = new Map<string, ts.Expression>()
    for (const property of route.properties) {
      if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)))
        properties.set(property.name.text, property.initializer)
      else if (ts.isShorthandPropertyAssignment(property))
        properties.set(property.name.text, property.name)
      else
        fail(property, 'route descriptors cannot contain spreads or computed fields')
    }
    const kind = properties.get('kind')
    const path = properties.get('path')
    if (!kind || !path || !['exact', 'prefix'].includes(textOf(kind)))
      return fail(route, 'route descriptors require kind: exact/prefix and a static path')
    return textOf(path)
  }

  function routeOf(route: ts.Expression): { path: string, parameters: Array<Record<string, unknown>> } {
    const definition = valueOf(route)
    const literal = ts.isObjectLiteralExpression(definition)
    let path = literal ? descriptorPath(definition) : textOf(route)
    if (!path.startsWith('/') || path.startsWith('//') || /[?#\\'`$]/.test(path) || (literal && path !== '/' && path.endsWith('/')))
      return fail(route, 'route path must be an absolute pathname without query, fragment or code delimiters')
    if (literal && new URL(path, 'http://localhost').pathname !== path)
      return fail(route, 'route descriptor path must be canonical')
    if (!literal)
      path = new URL(path, 'http://localhost').pathname
    const parameters: Array<Record<string, unknown>> = []
    if (literal) {
      if (/[{}]/.test(path))
        return fail(route, 'literal braces are not supported by the OpenAPI parser')
      return { path, parameters }
    }
    if (/^\/:|[{}*()+]/.test(path))
      return fail(route, 'only static paths and simple :parameter segments below a static prefix are supported')
    path = path.replace(/\/:([A-Z_$][\w$]*)(?=\/|$)/gi, (_, name: string) => {
      if (parameters.some(parameter => parameter.name === name))
        return fail(route, 'path parameter names must be unique')
      parameters.push({ name, in: 'path', required: true, type: 'string' })
      return `/{${name}}`
    })
    if (path.includes(':'))
      return fail(route, 'only simple :parameter segments are supported')
    return { path, parameters }
  }

  function register(call: ts.CallExpression, method: string, route: ts.Expression, handler: ts.Expression): void {
    if (!methods.has(method))
      return fail(call, 'declare a specific OpenAPI HTTP method instead of all/connect/trace/query')
    const { path, parameters } = routeOf(route)
    paths[path] ??= {}
    if (paths[path][method])
      return fail(call, `duplicate ${method.toUpperCase()} ${path}`)
    const name = `Dsh${method[0].toUpperCase()}${method.slice(1)}${count++}`
    const fn = handlerOf(handler)
    const signature = checker.getTypeAtLocation(handler).getCallSignatures()[0]
    if (!signature)
      return fail(handler, 'handler must be callable')
    const response = checker.getReturnTypeOfSignature(signature)
    const schema = alias(`${name}Response`, checker.getAwaitedType(response) ?? response, handler)
    const reads = new Set<string>()
    function requestOf(node: ts.CallExpression, kind: string): void {
      if (reads.has(kind))
        return fail(node, 'use one getQuery/readBody contract per handler')
      reads.add(kind)
      let typed: ts.Node = node
      while (ts.isAwaitExpression(typed.parent) || ts.isParenthesizedExpression(typed.parent) || ts.isAsExpression(typed.parent) || ts.isTypeAssertionExpression(typed.parent))
        typed = typed.parent
      const inferred = node.typeArguments?.[0] && typed === node ? checker.getTypeFromTypeNode(node.typeArguments[0]) : checker.getTypeAtLocation(typed)
      const type = checker.getNonNullableType(checker.getAwaitedType(inferred) ?? inferred)
      if (kind === 'getQuery') {
        for (const field of checker.getPropertiesOfType(type)) {
          const ref = alias(`${name}Query${parameters.length}`, checker.getTypeOfSymbolAtLocation(field, node), node)
          parameters.push({ ...ref, name: field.getName(), in: 'query', required: !(field.flags & ts.SymbolFlags.Optional) })
        }
        return
      }
      if (!(type.flags & ts.TypeFlags.Object) || checker.isArrayType(type) || checker.isTupleType(type) || checker.getIndexTypeOfType(type, ts.IndexKind.String))
        return fail(node, 'readBody requires an object contract with named fields')
      const properties = checker.getPropertiesOfType(type).map(field => ({ name: field.getName(), type: typeValue(checker.getTypeOfSymbolAtLocation(field, node), node), required: !(field.flags & ts.SymbolFlags.Optional) }))
      typeScope.interfaces.push({ name: `${name}Body`, properties, export: true })
      parameters.push({ name: 'body', in: 'body', required: true, schema: { $ref: `#/definitions/${name}Body` } })
    }
    function visit(node: ts.Node): void {
      if (ts.isFunctionLike(node) && node !== fn)
        return
      if (ts.isCallExpression(node)) {
        const kind = nameOf(node.expression)
        if (kind === 'getQuery' || kind === 'readBody')
          requestOf(node, kind)
      }
      ts.forEachChild(node, visit)
    }
    visit(fn)
    paths[path][method] = { parameters, responses: { 200: { description: `${method.toUpperCase()} ${path}`, schema } } }
  }

  // ponytail: only static, direct registrations; add explicit AST cases when dynamic setups are needed.
  function collect(node: ts.CallExpression): void {
    const setup = valueOf(node.arguments[0])
    if (!(ts.isArrowFunction(setup) || ts.isFunctionExpression(setup) || ts.isFunctionDeclaration(setup)) || !setup.body || !setup.parameters[0] || !ts.isIdentifier(setup.parameters[0].name))
      return fail(node, 'defineWebServer requires a static setup callback with an app parameter')
    const app = checker.getSymbolAtLocation(setup.parameters[0].name)
    function isApp(expression: ts.Expression): boolean {
      return ts.isIdentifier(expression) ? checker.getSymbolAtLocation(expression) === app : ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression) && isApp(expression.expression.expression)
    }
    function visit(expression: ts.Expression): void {
      if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression) || !isApp(expression.expression.expression))
        return fail(expression, 'setup must use direct app.method(...) route declarations')
      const receiver = expression.expression.expression
      if (ts.isCallExpression(receiver))
        visit(receiver)
      const method = expression.expression.name.text
      if (method === 'use')
        return
      if (method === 'on') {
        if (expression.arguments.length < 3)
          return fail(expression, 'app.on requires method, path and handler')
        register(expression, textOf(expression.arguments[0]).toLowerCase(), expression.arguments[1], expression.arguments[2])
      }
      else {
        if (expression.arguments.length < 2)
          return fail(expression, 'route declarations require path and handler')
        register(expression, method, expression.arguments[0], expression.arguments[1])
      }
    }
    function statementOf(statement: ts.Statement): void {
      if (ts.isExpressionStatement(statement))
        return visit(statement.expression)
      if (ts.isReturnStatement(statement)) {
        if (statement.expression && checker.getSymbolAtLocation(statement.expression) !== app)
          visit(statement.expression)
        return
      }
      if (ts.isEmptyStatement(statement))
        return
      if (!ts.isVariableStatement(statement))
        return fail(statement, 'conditional, looped and mounted route registration is not supported')
      if (!(statement.declarationList.flags & ts.NodeFlags.Const))
        return fail(statement, 'route bindings must be const')
      const check = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && checker.getSymbolAtLocation(node) === app)
          fail(node, 'setup must use direct app.method(...) route declarations')
        ts.forEachChild(node, check)
      }
      check(statement)
    }
    if (ts.isBlock(setup.body)) {
      for (const statement of setup.body.statements) {
        statementOf(statement)
        if (ts.isReturnStatement(statement))
          break
      }
    }
    else {
      visit(setup.body)
    }
  }

  function scan(node: ts.Node): void {
    if (ts.isFunctionLike(node))
      return
    if (ts.isCallExpression(node) && nameOf(node.expression) === 'defineWebServer') {
      let parent = node.parent
      while (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent))
        parent = parent.parent
      const statement = ts.isVariableDeclaration(parent) ? parent.parent.parent : parent
      if (!ts.isSourceFile(statement.parent) || (!ts.isVariableStatement(statement) && !ts.isExportAssignment(statement)))
        return fail(node, 'services must be declared directly at module scope, not in a conditional or factory')
      collect(node)
    }
    else {
      ts.forEachChild(node, scan)
    }
  }
  scan(file)
  if (!count)
    throw new TypeError('dsh-h3/genapi: no static defineWebServer routes found in input')
  const http = configRead.config.meta?.import?.http ?? 'ofetch'
  const main = configRead.graphs.scopes.main
  if (main && !main.imports.some(item => item.names?.includes('ofetch'))) {
    main.imports.unshift({ name: 'Http', value: http, namespace: true, type: true }, { names: ['ofetch'], value: http })
    // The preset fixes its response generic to JSON; a wider responseType breaks ofetch's types.
    main.typings.push({ name: 'FetchOptions', value: 'Omit<Http.FetchOptions, \'responseType\'> & { responseType?: \'json\' }' })
  }
  configRead.source = { swagger: '2.0', info: { title: basename(entry, '.ts'), version: '0.0.0' }, paths, definitions: {} }
  return configRead
}
