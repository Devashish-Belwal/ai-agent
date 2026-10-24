import { createServer } from './server.js';
import { environment } from './config/environment.js';

const app = createServer();

app.listen(environment.PORT, '0.0.0.0', () => {
  console.log(`🚀 API backend listening on http://0.0.0.0:${environment.PORT}`);
  console.log(`🔐 Better-Auth mounted at http://0.0.0.0:${environment.PORT}/api/v1/auth`);
});
