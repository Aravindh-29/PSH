const fs=require('node:fs'),path=require('node:path');
const schemaPath=path.join(__dirname,'../../database/schema.sql');
const sql=fs.readFileSync(path.join(__dirname,'../../database/organization.sql'),'utf8');
const schema=fs.readFileSync(schemaPath,'utf8');
const block='-- BEGIN ORGANIZATION HIERARCHY\n'+sql+'\n-- END ORGANIZATION HIERARCHY';
const updated=schema.includes('-- BEGIN ORGANIZATION HIERARCHY')?schema.replace(/-- BEGIN ORGANIZATION HIERARCHY[\s\S]*?-- END ORGANIZATION HIERARCHY/,()=>block):schema.replace(/\s*COMMIT;\s*$/,()=>'\n'+block+'\nCOMMIT;\n');
if(process.argv.includes('--check')){if(schema!==updated)throw Error('Run node server/scripts/sync-organization.js');console.log('Organization schema synchronized.')}else fs.writeFileSync(schemaPath,updated);
