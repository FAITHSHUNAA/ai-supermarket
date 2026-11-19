# AI 超市

一个账号逛应用、选模型、用积分。项目按模块拆开，方便以后单独改某一块。

界面和流程参考公开站点 [aigzm.com](https://aigzm.com/) 的访客能看到的能力：应用货架、模型价格、会员、充值、个人中心、开发者入驻、控制台、接入文档和管理后台。文案、图标、法律文本和示例数据都是这个仓库自己的，不包含对方的源码、商标或公司文书。

## 模块

| 模块 | 目录 | 做什么 |
| --- | --- | --- |
| 内核 | `server/lib.js` `server/seed.js` `server/domain.js` | 账号、积分预扣/确认/释放、订单、分成 |
| 身份 | `server/routes/auth.js` `client/src/modules/identity.jsx` | 注册、验证码、密码、会话、安全、邀请 |
| 货架 | `server/routes/platform.js` `client/src/modules/store.jsx` | 分类、应用、模型目录、公开设置 |
| 交易 | `server/routes/commerce.js` `client/src/modules/billing.jsx` | 充值、会员、购买、售后、收银台 |
| 模型 | `server/routes/models.js` | 对话、向量、图片、听写，OpenAI 风格入口 |
| 数据接口 | `server/routes/dataApi.js` | 演示数据网关，成功扣积分，失败不落账 |
| 开发者 | `server/routes/developer.js` `client/src/modules/developer.jsx` | 入驻、钥匙、应用、沙箱、托管、佣金 |
| 授权 | `server/routes/oauth.js` | 授权码 + PKCE |
| 后台 | `server/routes/admin.js` `client/src/modules/admin.jsx` | 审核、价格、结算、内容安全、设置 |
| 店面 | `client/src/modules/home.jsx` `client/src/shell/` | 首页、导航、文档和设计规范 |

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开 <http://127.0.0.1:5173>。接口在 <http://127.0.0.1:8787>。

生产模式：

```bash
npm run build
npm start
```

打开 <http://127.0.0.1:8787>。

```bash
npm test
```

会另开一个临时数据库，把注册、充值、购买、钥匙、预扣、数据接口、OAuth 和管理员审核走一遍。

## 演示账号

| 身份 | 手机号 | 密码 |
| --- | --- | --- |
| 管理员 | 13800000001 | Admin#123456 |
| 会员林晓 | 13800000002 | User#123456 |
| 开发者周衡 | 13800000003 | Dev#123456 |
| 待审核陈麦 | 13800000004 | Pending#123456 |

开发者演示钥匙：`sk_live_demo_zhouheng_market_key`

文案货架的客户端密钥：`sec_demo_copy_shelf`

短信没有接真实通道。管理后台可以关掉“页面上显示演示验证码”。支付是站内收银台：确认后订单变成 `paid`，不会扣银行卡。模型默认在本站生成演示结果；后台可以给单个模型填写上游地址。

## 调用约定

1. 创建 API Key 后，明文只返回一次。
2. `POST /v1/developer/api-keys/{id}/confirm-delivery`，请求体必须是 `{}`。
3. `Authorization: Bearer` 和 `X-API-Key` 不要同时带。
4. 余额不足返回 `402 insufficient_balance`。
5. 调用先预扣，成功确认，失败释放。
6. 积分和佣金分开。佣金只通过线下结算申请处理。

契约入口：`/llms.txt`、`/openapi.json`、`/developer-integration-guide.md`。示例在 `examples/`。

## 部署

容器：

```bash
docker build -t ai-supermarket .
docker run -p 8787:8787 ai-supermarket
```

`render.yaml` 可以直接作为 Render 的 Node Web Service。数据写在进程磁盘上的 `data/db.json`，换机器或清空磁盘后会回到种子数据。要长期保存，把 `DATA_DIR` 指到持久卷。
