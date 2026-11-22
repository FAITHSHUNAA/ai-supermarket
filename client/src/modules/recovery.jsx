import {useState} from "react";
import {Link} from "react-router-dom";
import {api} from "../api";
import {useSession} from "../shell/session";
import {Field,Notice} from "../shell/ui";

export function Recovery(){
  const {user}=useSession();
  const [code,setCode]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState(null),[busy,setBusy]=useState(false);
  async function submit(event){
    event.preventDefault();const form=event.currentTarget;
    setBusy(true);setError(null);setMessage("");setCode("");
    try{
      const result=await api("/v1/auth/recovery/"+(user?"issue":"reset"),{method:"POST",body:Object.fromEntries(new FormData(form))});
      form.reset();
      if(user)setCode(result.code);else setMessage("密码已更新，原登录会话已退出。请用新密码登录并生成新的恢复码。");
    }catch(err){setError(err);}finally{setBusy(false);}
  }
  if(user===undefined)return <p>正在读取账号…</p>;
  return <section className="section"><h2>账号恢复</h2><form className="card" onSubmit={submit}>
    {user ? <p>输入当前密码生成一次性恢复码。请保存到密码管理器，重新生成会使旧码失效。</p> : <>
      <Field label="用户名"><input name="username" autoComplete="username" required/></Field>
      <Field label="一次性恢复码"><input name="code" autoComplete="off" required/></Field></>}
    <Field label={user?"当前密码":"新密码（12 至 128 位）"}><input type="password" name="password" minLength={user?1:12} maxLength={128} autoComplete={user?"current-password":"new-password"} required/></Field>
    <button className="btn" disabled={busy}>{user?"生成恢复码":"重置密码"}</button>
    {code && <p>请现在保存：<code>{code}</code></p>}<Notice error={error}>{message}</Notice>
    <Link to={user?"/profile":"/login"}>{user?"返回个人中心":"去登录"}</Link>
  </form></section>;
}
