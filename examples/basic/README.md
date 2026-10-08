# DSH 基础插件示例

使用 [dsh-h3](<../../README.md>) 的纯宿主插件。路由运行在宿主 WebServer 上，不启动独立 HTTP 服务器。

## 项目结构

```text
src/
  index.ts
  service/
    index.ts
    routes/
      health.ts
      server.ts
      inspect.ts
```

- [插件入口](<src/index.ts>)：导出 `inject` 和 `apply`，通过带标签的 Cordis effect 激活服务，传入启动时间
- [服务入口](<src/service/index.ts>)：声明 `ServiceOptions` 并集中注册路由
- [健康检查](<src/service/routes/health.ts>)：从事件读取服务选项，返回运行时长
- [宿主信息](<src/service/routes/server.ts>)：从事件读取 Context，返回 WebServer 监听端口
- [请求诊断](<src/service/routes/inspect.ts>)：返回当前请求的方法、路径和 query
- [构建配置](<tsdown.config.ts>)：构建插件入口，保留外部包依赖
- [Loader patch](<cordis.patch.yml>)：向真实 DSH profile 插入编译后的插件

路由处理器直接使用 H3 的 `defineEventHandler`。业务路由文件只关注处理逻辑，注册与生命周期由服务入口和插件入口管理。

## 构建

从仓库根目录运行：

```sh
pnpm install
pnpm build
pnpm --filter dsh-plugin-h3-basic build
pnpm --filter dsh-plugin-h3-basic typecheck
```

示例通过 `workspace:*` 使用主包，因此需要先构建主包。插件的公开入口是 `./dist/index.mjs`。

## 加载到 DSH

安装 `dsh` CLI 后，从仓库根目录启动 Web profile：

```sh
dsh web --patch ./examples/basic/cordis.patch.yml
```

patch 中的 `./dist/index.mjs` 相对于 patch 所在目录解析。`inject = ['webServer']` 保证服务可用后再激活插件；无需客户端 bundle 或额外服务器。

如果 DSH 已经运行，请携带 patch 重启，而不是在同一端口启动第二份实例。禁用或卸载 `h3-basic` Loader 条目时，effect 会移除全部路由。

## 试用

以宿主打印的 URL 为准；如果监听端口不是 `3080`，请替换下列地址：

```sh
curl http://127.0.0.1:3080/api/h3-basic/health
# {"status":"ok","uptimeMs":...}

curl http://127.0.0.1:3080/api/h3-basic/server
# {"port":3080}

curl 'http://127.0.0.1:3080/api/h3-basic/inspect/request?query=1'
# {"method":"GET","path":"/api/h3-basic/inspect/request","query":{"query":"1"}}
```

健康检查使用字符串路径；宿主信息使用 exact，只匹配自身路径；请求诊断使用 prefix，同时匹配 `/api/h3-basic/inspect` 及其子路径，但不匹配 `/api/h3-basic/inspection`。`POST /api/h3-basic/health` 返回 `405`。

`/api/h3-basic` 命名空间避免与宿主已有路由冲突。这些诊断端点没有应用层认证、不读取请求体、不修改状态；扩展为敏感操作前，请先增加授权和请求体大小限制。

## 检查

从仓库根目录运行：

```sh
pnpm test --run test/basic-example.test.ts
```

该命令构建两个包，导入编译后的插件，在真实 Cordis Context 和临时回环 WebServer 上验证响应、路由边界与插件卸载。
