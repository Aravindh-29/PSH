const fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../../database/schema.sql'),schema=fs.readFileSync(file,'utf8');
const block='-- BEGIN EMAIL AUTOMATION\n'+fs.readFileSync(path.join(__dirname,'../../database/email-automation.sql'),'utf8')+'\n-- END EMAIL AUTOMATION';
const updated=schema.includes('-- BEGIN EMAIL AUTOMATION')?schema.replace(/-- BEGIN EMAIL AUTOMATION[\s\S]*?-- END EMAIL AUTOMATION/,()=>block):schema.replace(/\s*COMMIT;\s*$/,()=> '\n'+block+'\nCOMMIT;\n');
if(process.argv.includes('--check')){if(updated!==schema)throw Error('Run node server/scripts/sync-email-automation.js');console.log('Email automation schema synchronized.')}else fs.writeFileSync(file,updated);
