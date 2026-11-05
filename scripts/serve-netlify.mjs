// Exercise the same Request/Response handler used by Netlify, without a Python server.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleRequest} from '../server/api.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(root,'.env.netlify')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const port = Number(process.env.NETLIFY_LOCAL_PORT || 8888);
const publicDir = path.join(root,'dist');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json'};
http.createServer(async (req,res)=>{
  try {
    const url = new URL(req.url,`http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/') || url.pathname.startsWith('/.netlify/functions/api/')) {
      const init = {method:req.method,headers:req.headers};
      if (!['GET','HEAD'].includes(req.method)) { init.body = req; init.duplex = 'half'; }
      const response = await handleRequest(new Request(url,init),{ip:req.socket.remoteAddress});
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } else {
      let file = path.resolve(publicDir,'.'+decodeURIComponent(url.pathname));
      if (!file.startsWith(publicDir+path.sep)) file = path.join(publicDir,'index.html');
      try { if (!(await fs.stat(file)).isFile()) throw new Error(); } catch { file = path.join(publicDir,'index.html'); }
      res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
      res.end(await fs.readFile(file));
    }
  } catch { res.writeHead(500); res.end('Run npm run build:netlify first and check local configuration.'); }
}).listen(port,'127.0.0.1',()=>console.log(`Netlify API + frontend: http://127.0.0.1:${port}`));
