// Calendar dates are not instants. All instant-to-business-date operations require an explicit zone.
const dateFormatters=new Map<string,Intl.DateTimeFormat>();
function formatter(timeZone:string){
 if(!timeZone.trim())throw new Error('Business timezone is required');
 const cached=dateFormatters.get(timeZone);if(cached)return cached;
 const value=new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
 if(dateFormatters.size>=32){const oldest=dateFormatters.keys().next().value;if(oldest!==undefined)dateFormatters.delete(oldest)}
 dateFormatters.set(timeZone,value);return value;
}
export function businessDate(instant:Date,timeZone:string):string{
 if(!Number.isFinite(instant.getTime()))throw new Error('Invalid instant');
 const parts=formatter(timeZone).formatToParts(instant);
 const part=(type:string)=>parts.find(value=>value.type===type)?.value;
 return `${part('year')!.padStart(4,'0')}-${part('month')}-${part('day')}`;
}
function parseCalendarDate(value:string):Date{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Invalid calendar date');
 const [year,month,day]=value.split('-').map(Number);if(year<1)throw new Error('Invalid calendar date');
 const date=new Date(0);date.setUTCFullYear(year,month-1,day);date.setUTCHours(0,0,0,0);
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw new Error('Invalid calendar date');return date;
}
export function addCalendarDays(value:string,days:number):string{
 if(!Number.isSafeInteger(days))throw new Error('Invalid day count');
 const date=parseCalendarDate(value);date.setUTCDate(date.getUTCDate()+days);
 const result=date.toISOString().slice(0,10);parseCalendarDate(result);return result;
}
export function businessDayStart(value:string,timeZone:string):Date{
 const anchor=parseCalendarDate(value).getTime();formatter(timeZone);
 // Find the first instant of the requested local date; handles missing midnight and 23/25h days.
 let low=anchor-36*3600000,high=anchor+36*3600000;
 if(!(businessDate(new Date(low),timeZone)<value&&businessDate(new Date(high),timeZone)>value))throw new Error('Unsupported business-day boundary');
 while(low<high){const middle=Math.floor((low+high)/2);if(businessDate(new Date(middle),timeZone)<value)low=middle+1;else high=middle}
 const start=new Date(low);if(businessDate(start,timeZone)!==value)throw new Error('Calendar date does not exist in business timezone');return start;
}
export function businessDateRange(from:string,to:string,timeZone:string){
 parseCalendarDate(from);parseCalendarDate(to);if(from>to)throw new Error('Invalid business date range');
 return {fromInclusive:businessDayStart(from,timeZone).toISOString(),toExclusive:businessDayStart(addCalendarDays(to,1),timeZone).toISOString()};
}
export function formatCalendarDate(value:string,locale:string):string{
 return new Intl.DateTimeFormat(locale,{timeZone:'UTC',calendar:'gregory',year:'numeric',month:'long',day:'numeric'}).format(parseCalendarDate(value));
}
