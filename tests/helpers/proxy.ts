import type { Socket } from "bun";

type Pipe = {
	client: Socket<Pipe>;
	upstream?: Socket<undefined>;
	/** What the client sent before the upstream connection was open. */
	pending: Uint8Array[];
};

/**
 * A TCP proxy to a SurrealDB server that can be severed on demand, so a test can
 * drop a client's connection exactly as a network failure would, while the
 * server and its other connections carry on.
 *
 * ```ts
 * const proxy = startProxy("ws://localhost:8000");
 * await surreal.connect(proxy.url);
 * proxy.sever(); // the client sees its connection drop, and reconnects
 * ```
 */
export function startProxy(target: string) {
	const url = new URL(target);
	const { port } = url;
	// SurrealDB binds IPv4 by default, and `localhost` may resolve to `::1` first.
	const hostname = url.hostname === "localhost" ? "127.0.0.1" : url.hostname;
	const pipes = new Set<Pipe>();

	const server = Bun.listen<Pipe>({
		hostname: "127.0.0.1",
		port: 0,
		socket: {
			open(client) {
				const pipe: Pipe = { client, pending: [] };
				client.data = pipe;
				pipes.add(pipe);

				Bun.connect({
					hostname,
					port: Number(port || 80),
					socket: {
						data(_upstream, chunk) {
							client.write(new Uint8Array(chunk));
						},
						close() {
							client.end();
						},
						error() {
							client.end();
						},
					},
				})
					.then((upstream) => {
						pipe.upstream = upstream;
						for (const chunk of pipe.pending) upstream.write(chunk);
						pipe.pending.length = 0;
					})
					.catch(() => client.end());
			},
			data(client, chunk) {
				const pipe = client.data;
				// The buffer is only valid for the duration of this callback, so copy it.
				const copy = new Uint8Array(chunk);
				if (pipe.upstream) pipe.upstream.write(copy);
				else pipe.pending.push(copy);
			},
			close(client) {
				client.data.upstream?.end();
				pipes.delete(client.data);
			},
			error() {},
		},
	});

	return {
		/** The address clients connect to in place of the server's. */
		url: `ws://127.0.0.1:${server.port}`,
		/** Drop every connection that is open through the proxy right now. */
		sever() {
			for (const pipe of [...pipes]) {
				pipe.upstream?.end();
				pipe.client.end();
			}
		},
		stop() {
			server.stop(true);
		},
	};
}
