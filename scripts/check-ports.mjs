import net from "node:net";
for (const port of [43187, 43188]) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Project port ${port} is occupied. No existing service was contacted. Choose different dedicated ports before starting.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
