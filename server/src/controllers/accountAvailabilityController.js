const pool=require('../db/pool');
const {checkAccountAvailability}=require('../services/accountAvailability');
module.exports=async function(req,res,next){
  try{
    if(!req.access.admin)throw Object.assign(new Error("You don't have permission to check user accounts."),{status:403});
    const availability=await checkAccountAvailability(pool,req.body);
    res.set('Cache-Control','no-store').json({success:true,availability});
  }catch(error){next(error)}
};
