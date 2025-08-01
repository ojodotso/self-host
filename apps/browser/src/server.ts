import { type BrowserServer, chromium } from 'playwright-core';

main();

let server: BrowserServer | null = null;
async function main() {
  server = await launch();
  console.log(server.wsEndpoint());

  ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT'].forEach((signal) => {
    process.on(signal, async () => {
      console.log(`${signal} received, shutting down...`);
      if (server) {
        await server.close();
      }
      process.exit(0);
    });
  });
}

function getEnvVars() {
  return {
    info: (process.env.IMAGE_INFO || '').toLowerCase(),
    channel: process.env.BROWSER_CHANNEL,
    port: parseInt(process.env.BROWSER_PORT || '') || 53333,
    wsPath: process.env.BROWSER_WS_ENDPOINT || '/playwright',
    args: process.env.BROWSER_ARGS ? JSON.parse(process.env.BROWSER_ARGS) : [],
  };
}

async function launch() {
  const { info, channel, port, wsPath, args } = getEnvVars();
  const launchOptions = {
    args: [...args, '--headless=new'],
    ignoreDefaultArgs: ['--headless=old'],
    executablePath: '/usr/bin/google-chrome',
    channel,
    port,
    wsPath,
  };

  try {
    console.log('Launching browser with configuration:', launchOptions);

    return await chromium.launchServer(launchOptions);
  } catch (error) {
    console.error('Failed to launch browser server:', error);
    console.error('Launch environment:', {
      uid: process.getuid?.(),
      gid: process.getgid?.(),
      cwd: process.cwd(),
      env: {
        HOME: process.env.HOME,
        USER: process.env.USER,
      },
    });
    throw error;
  }
}
