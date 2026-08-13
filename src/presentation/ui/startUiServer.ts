import { createServer, type Server } from 'node:http';
import type { Container } from '../../container.js';
import { handleUiRequest } from './handleUiRequest.js';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 3847;
const PORT_RETRY_LIMIT = 10;

export type StartedUiServer = {
  readonly url: string;
  readonly port: number;
  close(): Promise<void>;
};

export type StartUiServerOptions = {
  readonly port?: number;
};

export async function startUiServer(
  container: Container,
  options: StartUiServerOptions = {},
): Promise<StartedUiServer> {
  var requestedPort = options.port ?? DEFAULT_PORT;
  var server = createServer((req, res) => {
    void handleUiRequest(container, req, res);
  });

  var port = await listenOnFreePort(server, requestedPort);

  return {
    url: `http://${HOST}:${port}`,
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function listenOnFreePort(server: Server, requestedPort: number): Promise<number> {
  if (requestedPort === 0) {
    await listen(server, 0);
    return boundPort(server);
  }

  var lastError: unknown;
  for (var offset = 0; offset < PORT_RETRY_LIMIT; offset++) {
    var port = requestedPort + offset;
    try {
      await listen(server, port);
      return port;
    } catch (error) {
      lastError = error;
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to bind Continuum UI server');
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    var onError = (error: Error) => {
      server.off('error', onError);
      reject(error);
    };
    server.once('error', onError);
    server.listen(port, HOST, () => {
      server.off('error', onError);
      resolve();
    });
  });
}

function boundPort(server: Server): number {
  var address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind Continuum UI server');
  }
  return address.port;
}
