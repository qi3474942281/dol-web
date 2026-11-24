import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
http.createServer(async(req,res)=>{
 const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(relative==='/'?'/index.html':relative));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{
  const info=await stat(file);if(!info.isFile())throw Error('Not a file');
  const type=file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.json')?'application/json':'application/octet-stream';
  res.writeHead(200,{'Content-Type':type,'Content-Length':info.size});
  createReadStream(file).pipe(res);
 }catch{res.writeHead(404);res.end();}
}).listen(8765,'0.0.0.0');
