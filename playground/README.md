# DSH 基础插件示例 (Basic Example)

本示例展示了如何使用 [`dsh-h3`](../../README.md) 构建一个**纯宿主插件**。插件内的路由直接挂载并运行在宿主的 WebServer 上，无需启动独立的 HTTP 服务器或占用额外端口。

---

## 📁 项目结构

```text
genapi.config.ts          # GenAPI 配置文件（静态读取服务器入口并生成客户端 API）
cordis.patch.yml          # DSH Loader patch（向真实 Profile 注入编译后的插件）
tsdown.config.ts          # 插件构建配置（仅打包宿主代码，保留外部依赖）
src/
├── index.ts              # 插件主入口（导出 inject 与 apply，托管服务激活与生命周期）
├── host/
│   └── server/
│       ├── index.ts      # 服务器入口（通过 defineWebServer 注册路由与配置项）
│       └── routes/       # 业务路由目录
│           ├── health.ts # 健康检查路由（读取服务选项，返回运行时间）
│           ├── server.ts # 宿主信息路由（读取 Context，返回监听端口）
│           └── inspect.ts# 请求诊断路由（返回方法、路径和 Query）
└── client/
    └── apis/             # GenAPI 静态生成的客户端文件（提交至 Git，不可手动修改）
        ├── index.ts      # 生成的请求 API 函数
        └── index.type.ts # 生成的响应类型定义

```

> 💡 **设计设计原则**：路由处理器统一采用 H3 的 `defineEventHandler`。业务文件仅关注处理逻辑，具体的路由注册与生命周期则交给服务入口与插件主入口集中管理。

---

## 🛠️ 构建指南

由于本示例通过 `workspace:*` 依赖主包，必须先在**仓库根目录**完成主包构建：

```sh
# 1. 安装项目依赖并构建主包
pnpm install
pnpm build

# 2. 生成示例插件的客户端 API
pnpm genapi

# 3. 编译插件并进行类型检查
pnpm build
pnpm typecheck

```

> 📌 **产物说明**：插件的最终打包入口为 `./dist/index.mjs`。打包产物仅包含宿主端代码，不包含客户端请求代码。

---

## ⚡ 生成与调用客户端 API

### 1. 代码生成

在仓库根目录或示例目录下执行生成命令（生成过程**不启动** DSH，亦**不执行**宿主路由代码）：

```sh
pnpm genapi
# 或在当前示例目录下：
pnpm genapi

```

### 2. 客户端调用示例

在同源客户端（如前端应用）中调用：

```ts
import { getApiHealth, getApiInspect, getApiServer } from './apis'

// 调用自动生成的客户端函数
const health = await getApiHealth()
const server = await getApiServer()
const request = await getApiInspect({ query: { query: '1' } })

console.log(health.uptimeMs, server.port, request.query)
```

> 💡 **跨域/独立服务调用**：若在 Node.js 或异构客户端中调用，传入 `baseURL` 选项即可（例如 `{ baseURL: 'http://127.0.0.1:3080' }`）。

### 3. 生成规则与维护

* **支持的路由子集**：GenAPI 支持静态字符串和静态前缀下的简单 `:parameter` 路由。唯一的通配符例外是非根、完全静态前缀后的末尾 `/**`：本示例的 `/api/inspect/**` 仅生成请求固定端点 `/api/inspect` 的 `getApiInspect`，不会生成通配符或任意子路径客户端。根级 `/**`、带参数前缀后的 `/**`、单星号及中间位置的 `**` 均不支持。
* **版本控制与检查**：生成的 API 文件需提交至 Git 仓库。构建/测试流程会校验生成的代码类型，而 ESLint 会自动忽略生成的代码以保留原始格式。

---

## 🚀 运行与加载 (DSH)

确保已安装 `dsh` CLI 工具，随后在**仓库根目录**启动 Web Profile：

```sh
dsh web --patch ./cordis.patch.yml
```

* **依赖注入保障**：`inject = ['webServer']` 确保仅在宿主 `webServer` 准备就绪后才激活插件。
* **卸载机制**：当禁用或卸载该 Loader 条目时，Cordis Effect 将自动移除全部已注册路由。
* ⚠️ **重载建议**：如果 DSH 已在运行，请携带 `--patch` 重启服务，避免在同一端口重复启动多份实例。

---

## 🧪 试用验证

启动后，可通过 `curl` 进行响应测试（端口请以实际宿主输出为准）：

```sh
# 1. 字符串路径精确匹配
curl [http://127.0.0.1:3080/api/health](http://127.0.0.1:3080/api/health)
# 响应: {"status":"ok","uptimeMs":...}

# 2. H3 静态字符串路径 /api/server（宿主推导为 exact）
curl [http://127.0.0.1:3080/api/server](http://127.0.0.1:3080/api/server)
# 响应: {"port":3080}

# 3. H3 通配符 /api/inspect/**（宿主推导为 prefix，子路径需直接请求，不由 GenAPI 枚举）
curl '[http://127.0.0.1:3080/api/inspect/request?query=1](http://127.0.0.1:3080/api/inspect/request?query=1)'
# 响应: {"method":"GET","path":"/api/inspect/request","query":{"query":"1"}}

# 4. 未允许的方法默认返回 405
curl -X POST [http://127.0.0.1:3080/api/health](http://127.0.0.1:3080/api/health)
# 响应: 405 Method Not Allowed
```

> ⚠️ **注意事项**：
> 1. 加载前请确认 `/api/*` 路由未被宿主或其他插件占用。如遇冲突，请在服务器入口修改路径并重新生成 API。
> 2. 诊断端点未配置应用层鉴权与请求体限制；在扩展为生产级敏感接口前，请补充鉴权中间件与请求体大小限制。

---
