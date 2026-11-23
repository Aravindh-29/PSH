const fs=require('node:fs'),path=require('node:path');
const {fixedRolesSQL}=require('../src/access/fixedRoles');
const file=path.join(__dirname,'../../database/schema.sql');
const schema=fs.readFileSync(file,'utf8');
const block='-- BEGIN FIXED APPLICATION ROLES\n'+fixedRolesSQL+'\n-- END FIXED APPLICATION ROLES';
const updated=schema.includes('-- BEGIN FIXED APPLICATION ROLES')
 ?schema.replace(/-- BEGIN FIXED APPLICATION ROLES[\s\S]*?-- END FIXED APPLICATION ROLES/,()=>block)
 :schema.replace(/\s*COMMIT;\s*$/,()=> '\n'+block+'\nCOMMIT;\n');
if(process.argv.includes('--check')){if(updated!==schema)throw Error('Run node server/scripts/sync-fixed-roles.js');console.log('Fixed role schema synchronized.');}
else fs.writeFileSync(file,updated);
