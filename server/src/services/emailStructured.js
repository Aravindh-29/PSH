// Exact labelled values are data, not instructions. They can be read without
// an AI service; unknown/ambiguous options are left for later review.
const normalize=value=>String(value).normalize('NFKC').trim().toLowerCase().replace(/[\s_-]+/g,' ');
function labels(body){
 const values=new Map();
 for(const line of String(body).split(/\r?\n/)){
  const match=line.match(/^\s*([\p{L}][\p{L}\p{N} _-]{0,99})\s*:\s*(\S[^\r\n]*)$/u);if(!match)continue;
  const key=normalize(match[1]),value=match[2].trim();
  if(!values.has(key))values.set(key,[]);
  if(!values.get(key).some(prior=>normalize(prior)===normalize(value)))values.get(key).push(value);
 }
 return values;
}
function fields(ctx,email){
 const source=labels(email.body),result={},customData={};
 const one=label=>{const values=source.get(normalize(label));return values?.length===1?values[0]:null;};
 const option=(options,text)=>{const matched=options.filter(o=>normalize(typeof o==='object'?o.label||o.value:o)===normalize(text)||normalize(typeof o==='object'?o.value:o)===normalize(text));return matched.length===1?(typeof matched[0]==='object'?matched[0].value:matched[0]):undefined;};
 const system={customer_name:'customerName',module_text:'moduleText',priority:'priority',impact:'impact',urgency:'urgency'};
 const reserved=new Set(['category_id','status','short_description','description','assignment_group','type_id','classification']);
 for(const definition of ctx.requiredFields){
  if(reserved.has(definition.field_key))continue;
  const text=one(definition.label);if(!text||text.length>1000)continue;
  let value=text;
  if(['priority','impact','urgency'].includes(definition.field_key)){
   value=text.toUpperCase();if(!(definition.field_key==='priority'?['LOW','MEDIUM','HIGH','CRITICAL']:['LOW','MEDIUM','HIGH']).includes(value))continue;
  }else if(definition.field_type==='dropdown'&&definition.options?.length){value=option(definition.options,text);if(value===undefined)continue;}
  if(definition.field_type==='number'){if(!Number.isFinite(Number(value)))continue;value=Number(value);}
  if(system[definition.field_key]){if(String(value).length<=255)result[system[definition.field_key]]=value;}
  else customData[definition.field_key]=value;
 }
 const categoryText=one('Category'),category=categoryText&&ctx.categories.filter(c=>normalize(c.name)===normalize(categoryText));
 if(category?.length===1)result.categoryId=category[0].id;
 const subText=one('Subcategory')||one('Sub category');
 if(subText&&result.categoryId){const matches=(ctx.subcategories||[]).filter(c=>c.category_id===result.categoryId&&normalize(c.name)===normalize(subText));if(matches.length===1)result.subcategoryId=matches[0].id;}
 if(Object.keys(customData).length)result.customData=customData;
 return result;
}
module.exports={normalize,labels,fields};
