# Tonpleun: Server-to-Server Communication via WebSockets

## What Is Tonpleun?

Tonpleun is a communication layer that lets servers call functions on other servers and perform basic WebSocket communication with other servers or local clients.

It is designed to make building a network of communicating servers easier, without having to manage all low-level communication details yourself.

## Features

- Call functions on other servers
- Send messages to other servers (message handling logic is up to your app)
- Register config values that other clients can update
- Basic client privilege levels
- Simple API for registering and calling services
- Optional schema-based validation for service input/output (for example with Zod)

## Installation

```bash
npm install tonpleun
```

## Usage

See [run-server.ts](./run-server.ts) and [test-client.ts](./test-client.ts) for example usage.

## AI-Generated Code

Some small parts of this codebase were made with AI assistance.

The major AI-assisted parts are the schema validation and the WebUI (idfk how to make a build script). This README was also improved with Copilot help for readability.

English is not my first language, and I have dyslexia, so this workflow helps me write clearer documentation faster.