/**
 * VIB3+ MCP Module
 * Re-exports MCP server and tools
 */

export { MCPServer, mcpServer } from './MCPServer.js';
export { toolDefinitions, getToolList, getToolNames, getTool, validateToolInput } from './tools.js';

import { mcpServer as defaultMcpServer } from './MCPServer.js';
export default defaultMcpServer;
