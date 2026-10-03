// Compatibility tombstone: the tutor feature is removed. Old tabs must refresh.
export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.statusCode=410;
  return res.json({success:false,error:'The tutor has been replaced by My Projects. Refresh Walmo.'});
}
