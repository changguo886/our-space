export type HabitPatternV3={todo_id:string;period:"day"|"week"|"month";arrangement:"fixed"|"flexible";target_count:number;weekdays:number[];month_days:number[];include_month_end:boolean};
export type ExecutionTemplateV3={id:string;todo_id:string;slot_key:string;starts_on:string;ends_on:string|null;execution_mode:"fixed"|"window"|"flexible";selector_kind:"all"|"weekday"|"month_day"|"month_end";selector_value:number|null;start_time:string|null;end_time:string|null;timezone:string;planned_minutes:number|null;window_start:string|null;window_end:string|null};
export type ExecutionOverrideV3={todo_id:string;slot_key:string;occurrence_date:string;action:"cancel"|"reschedule";scheduled_start:string|null;scheduled_end:string|null};
export function addDaysISO(day:string,amount:number):string{const [y,m,d]=day.split("-").map(Number);const v=new Date(Date.UTC(y,m-1,d+amount));return v.toISOString().slice(0,10);}
export function weekdayISO(day:string):number{const [y,m,d]=day.split("-").map(Number);return ((new Date(Date.UTC(y,m-1,d)).getUTCDay()+6)%7)+1;}
export function lastDayISO(day:string):number{const [y,m]=day.split("-").map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate();}
export function habitEligible(day:string,p:HabitPatternV3,start:string):boolean{
 if(day<start)return false;
 if(p.period==="day")return true;
 if(p.arrangement==="flexible")return true; // available that period, not a required appointment
 if(p.period==="week")return p.weekdays.includes(weekdayISO(day));
 const n=Number(day.slice(-2));return p.month_days.includes(n)||(p.include_month_end&&n===lastDayISO(day));
}
export function templateEligible(day:string,t:ExecutionTemplateV3,p?:HabitPatternV3,start?:string):boolean{
 if(day<t.starts_on||(t.ends_on!==null&&day>t.ends_on))return false;
 if(p&&!habitEligible(day,p,start??t.starts_on))return false;
 const n=Number(day.slice(-2));
 return t.selector_kind==="all"||(t.selector_kind==="weekday"&&weekdayISO(day)===t.selector_value)||(t.selector_kind==="month_day"&&n===t.selector_value)||(t.selector_kind==="month_end"&&n===lastDayISO(day));
}
export function upcomingEligible(p:HabitPatternV3,start:string,from:string,days=120,limit=3):string[]{
 const out:string[]=[];for(let n=0;n<days&&out.length<limit;n++){const day=addDaysISO(from,n);if(habitEligible(day,p,start))out.push(day);}return out;
}
