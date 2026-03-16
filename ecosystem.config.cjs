module.exports = {
	apps: [
		{
			name: "quote-builder-middleware",
			script: "src/server.js",
			interpreter: "node",
			instances: 1,
			exec_mode: "fork",
			env: {
				NODE_ENV: "production",
				PORT: 3000,
			},
		},
	],
};
