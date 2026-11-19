import { Link } from "react-router-dom";

export function Home() {
  return (
    <>
      <section className="hero">
        <div>
          <div className="kicker">AI 超市 · 精选能力持续上架</div>
          <h1>
            好用的 AI，
            <span>都在这里。</span>
          </h1>
          <p className="lede">一个账号，逛应用、选模型、用积分。把分散的工具和模型调用收进同一家超市，价格公开，账单可追。</p>
          <div className="row">
            <Link className="btn" to="/store">开始逛超市 →</Link>
            <Link className="btn ghost" to="/docs/models/pricing">查看模型价格</Link>
          </div>
          <div className="checks">
            <span>应用持续上新</span>
            <span>模型明码标价</span>
            <span>积分用完可查</span>
          </div>
        </div>
        <aside className="panel">
          <header>
            <span>TODAY'S PICKS</span>
            <span className="live">● LIVE</span>
          </header>
          <h2>今日精选货架</h2>
          <article className="feature-card">
            <div className="faint">模型专区</div>
            <h3>国产模型，即取即用</h3>
            <p className="muted">统一 API、统一积分，按次或按量选择。</p>
            <div className="tags">
              <span className="tag">对话</span>
              <span className="tag">代码</span>
              <span className="tag">视觉</span>
              <span className="tag">向量</span>
            </div>
          </article>
          <div className="mini-grid">
            <Link className="mini" to="/store?tag=开发">
              <div className="faint">效率专区</div>
              <strong>开发与 Agent</strong>
            </Link>
            <Link className="mini" to="/store?tag=视觉">
              <div className="faint">灵感专区</div>
              <strong>视觉与创作</strong>
            </Link>
          </div>
          <p className="muted">同一身份和积分台账，每次调用都能对上账。</p>
        </aside>
      </section>
      <section className="section">
        <div className="section-head">
          <div>
            <div className="faint">SHOP BY NEED</div>
            <h2>从你的需求开始逛</h2>
          </div>
          <p className="muted">不用先理解接口。先找想做的事，再挑应用、模型或会员。</p>
        </div>
        <div className="grid-3">
          <Link className="shelf" to="/store">
            <div className="faint">AI APPLICATIONS</div>
            <h3>应用货架</h3>
            <p className="muted">创作、办公、学习和效率工具，开通后就能体验。</p>
            <strong>逛应用 →</strong>
          </Link>
          <Link className="shelf" to="/docs/models">
            <div className="faint">FOUNDATION MODELS</div>
            <h3>模型货架</h3>
            <p className="muted">对话、代码、视觉和向量，统一价格、统一调用。</p>
            <strong>选模型 →</strong>
          </Link>
          <Link className="shelf" to="/membership">
            <div className="faint">MEMBERSHIP & POINTS</div>
            <h3>会员与积分</h3>
            <p className="muted">一次充值，全站使用。余额、预扣和退回都能看见。</p>
            <strong>看权益 →</strong>
          </Link>
        </div>
      </section>
      <section className="section">
        <div className="band">
          <div className="faint">WHY AI MARKET</div>
          <h2>简单购买，放心使用。</h2>
          <div className="grid-3">
            <article className="quote">
              <h3>一个账号</h3>
              <p className="muted">登录一次，就能使用已开通的应用和模型。</p>
            </article>
            <article className="quote">
              <h3>价格透明</h3>
              <p className="muted">模型计费和积分消耗先展示，再决定要不要调用。</p>
            </article>
            <article className="quote">
              <h3>消费可追溯</h3>
              <p className="muted">预扣、确认和释放都留在流水里。</p>
            </article>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="grid-2">
          <div>
            <div className="faint">FOR BUILDERS</div>
            <h2>你的 AI 产品，也可以上架。</h2>
            <p className="lede">从入驻、应用接入、模型调用到分成和线下结算，控制台按模块分开。</p>
            <div className="row">
              <Link className="btn" to="/register-developer">申请入驻</Link>
              <Link className="btn ghost" to="/docs">查看接入文档</Link>
            </div>
          </div>
          <div className="card">
            <p>开发者钥匙只展示一次，确认保存后才能调用。</p>
            <p className="muted">终端用户的积分和开发者的佣金分成两个账户，佣金走线下结算，不自动提现。</p>
          </div>
        </div>
      </section>
    </>
  );
}
