// @vitest-environment node
import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
import {it,expect} from "vitest";
it("atomically limits pre-auth attempts globally and per fingerprint and denies public execution",async()=>{
 const db=new PGlite();try{
 await db.exec("create schema private;create role anon;create role authenticated;create role service_role;");
 await db.exec(readFileSync(new URL("../supabase/migrations/20261111223000_judge_team_access_limits.sql",import.meta.url),"utf8"));
 const take=async(key:string)=>(await db.query<{ok:boolean}>("select public.judge_access_admit($1) as ok",[key])).rows[0].ok;
 for(let i=0;i<6;i++)expect(await take("a".repeat(64))).toBe(true);expect(await take("a".repeat(64))).toBe(false);
 for(let i=7;i<40;i++)expect(await take(i.toString(16).padStart(64,"0"))).toBe(true);
 expect(await take("f".repeat(64))).toBe(false);
 await db.exec("set role anon");await expect(db.query("select public.judge_access_admit($1)",["f".repeat(64)])).rejects.toThrow(/permission denied/);
 }finally{await db.close();}
},30000);
