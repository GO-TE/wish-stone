const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const javaPath = 'c:\\Users\\sybon\\.vscode\\extensions\\redhat.java-1.58.0-win32-x64\\jre\\25.0.4.1-win32-x86_64\\bin\\java.exe';
const backendDir = path.resolve(__dirname, '../backend');

const services = [
  { name: 'user-auth', jar: path.join(backendDir, 'user-auth-service/build/libs/user-auth-service-0.1.0-SNAPSHOT.jar'), port: 8081 },
  { name: 'wish-tower', jar: path.join(backendDir, 'wish-tower-service/build/libs/wish-tower-service-0.1.0-SNAPSHOT.jar'), port: 8082 },
  { name: 'interaction', jar: path.join(backendDir, 'interaction-service/build/libs/interaction-service-0.1.0-SNAPSHOT.jar'), port: 8083 },
  { name: 'group', jar: path.join(backendDir, 'group-service/build/libs/group-service-0.1.0-SNAPSHOT.jar'), port: 8084 },
  { name: 'gateway', jar: path.join(backendDir, 'gateway-service/build/libs/gateway-service-0.1.0-SNAPSHOT.jar'), port: 8080 },
];

console.log('========================================================');
console.log(' 🪨 Wish Stone Spring Boot MSA 5개 서비스 기동 중... ');
console.log('========================================================');

const children = [];

for (const svc of services) {
  if (!fs.existsSync(svc.jar)) {
    console.error(`[ERROR] JAR not found: ${svc.jar}`);
    continue;
  }
  console.log(`[STARTING] ${svc.name} on port ${svc.port}...`);
  const child = spawn(javaPath, ['-jar', svc.jar], {
    cwd: path.dirname(svc.jar),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (d) => {
    const line = d.toString().trim();
    if (line.includes('Started') || line.includes('Tomcat started') || line.includes('Netty started') || line.includes('ERROR')) {
      console.log(`[${svc.name}] ${line}`);
    }
  });

  child.stderr.on('data', (d) => {
    const line = d.toString().trim();
    if (line.includes('ERROR') || line.includes('Exception')) {
      console.error(`[${svc.name}-err] ${line}`);
    }
  });

  children.push(child);
}

process.on('SIGINT', () => {
  console.log('Shutting down all services...');
  for (const c of children) c.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  for (const c of children) c.kill();
  process.exit(0);
});
