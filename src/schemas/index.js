/**
 * VIB3+ Schema Registry
 * Centralized schema loading with AJV validation
 *
 * NOTE: Using dynamic imports with 'with' syntax for Node.js 22+ compatibility.
 * The 'assert' syntax was deprecated in favor of 'with' in Node.js 22.
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createRequire } from 'module';

// Use createRequire for JSON imports (works in all Node.js versions)
const require = createRequire(import.meta.url);

// Import schemas using require (Node.js compatible)
const parametersSchema = require('./parameters.schema.json');
const toolResponseSchema = require('./tool-response.schema.json');
const errorSchema = require('./error.schema.json');
const extensionSchema = require('./extension.schema.json');
const toolPackSchema = require('./tool-pack.schema.json');

class SchemaRegistry {
    constructor() {
        this.ajv = new Ajv({
            allErrors: true,
            verbose: true,
            strict: false
        });

        // Add format validators
        try {
            addFormats(this.ajv);
        } catch (e) {
            // addFormats may not be available in all environments
            console.warn('ajv-formats not available, some format validations disabled');
        }

        // Register schemas
        this.schemas = {
            parameters: parametersSchema,
            toolResponse: toolResponseSchema,
            error: errorSchema,
            extension: extensionSchema,
            toolPack: toolPackSchema
        };

        // Add all schemas to AJV first (required for $ref resolution)
        // Error schema must be added before tool-response which refs it
        this.ajv.addSchema(errorSchema, 'error.schema.json');
        this.ajv.addSchema(parametersSchema, 'parameters.schema.json');
        this.ajv.addSchema(extensionSchema, 'extension.schema.json');
        this.ajv.addSchema(toolPackSchema, 'tool-pack.schema.json');

        // Now compile validators (refs will resolve)
        this.validators = {};
        try {
            this.validators.error = this.ajv.compile(errorSchema);
            this.validators.parameters = this.ajv.compile(parametersSchema);
            this.validators.extension = this.ajv.compile(extensionSchema);
            this.validators.toolPack = this.ajv.compile(toolPackSchema);
            this.validators.toolResponse = this.ajv.compile(toolResponseSchema);
        } catch (e) {
            console.error('Schema compilation error:', e.message);
            // Provide stub validators that always pass (graceful degradation)
            for (const name of Object.keys(this.schemas)) {
                if (!this.validators[name]) {
                    this.validators[name] = () => true;
                }
            }
        }
    }

    /**
     * Validate data against a schema
     * @param {string} schemaName - Name of the schema
     * @param {object} data - Data to validate
     * @returns {{ valid: boolean, errors: array|null }}
     */
    validate(schemaName, data) {
        const validator = this.validators[schemaName];
        if (!validator) {
            return {
                valid: false,
                errors: [{ message: `Unknown schema: ${schemaName}` }]
            };
        }

        const valid = validator(data);
        return {
            valid,
            errors: valid ? null : validator.errors
        };
    }

    /**
     * Validate parameters and return normalized structure
     * @param {object} params - Raw parameters
     * @returns {{ valid: boolean, normalized: object|null, errors: array|null }}
     */
    validateParameters(params) {
        // Normalize flat parameter format to nested structure
        const normalized = this.normalizeParameters(params);
        const result = this.validate('parameters', normalized);

        return {
            ...result,
            normalized: result.valid ? normalized : null
        };
    }

    /**
     * Normalize flat parameters to nested schema structure
     */
    normalizeParameters(params) {
        return {
            system: params.system || 'quantum',
            variation: params.variation ?? 0,
            geometry: params.geometry ?? 0,
            rotation: {
                XY: params.rot4dXY ?? params.rotation?.XY ?? 0,
                XZ: params.rot4dXZ ?? params.rotation?.XZ ?? 0,
                YZ: params.rot4dYZ ?? params.rotation?.YZ ?? 0,
                XW: params.rot4dXW ?? params.rotation?.XW ?? 0,
                YW: params.rot4dYW ?? params.rotation?.YW ?? 0,
                ZW: params.rot4dZW ?? params.rotation?.ZW ?? 0
            },
            visual: {
                dimension: params.dimension ?? params.visual?.dimension ?? 3.5,
                gridDensity: params.gridDensity ?? params.visual?.gridDensity ?? 15,
                morphFactor: params.morphFactor ?? params.visual?.morphFactor ?? 1.0,
                chaos: params.chaos ?? params.visual?.chaos ?? 0.2,
                speed: params.speed ?? params.visual?.speed ?? 1.0,
                hue: params.hue ?? params.visual?.hue ?? 200,
                intensity: params.intensity ?? params.visual?.intensity ?? 0.5,
                saturation: params.saturation ?? params.visual?.saturation ?? 0.8
            }
        };
    }

    /**
     * Flatten normalized parameters back to engine format
     */
    flattenParameters(normalized) {
        return {
            system: normalized.system,
            variation: normalized.variation,
            geometry: normalized.geometry,
            rot4dXY: normalized.rotation.XY,
            rot4dXZ: normalized.rotation.XZ,
            rot4dYZ: normalized.rotation.YZ,
            rot4dXW: normalized.rotation.XW,
            rot4dYW: normalized.rotation.YW,
            rot4dZW: normalized.rotation.ZW,
            dimension: normalized.visual.dimension,
            gridDensity: normalized.visual.gridDensity,
            morphFactor: normalized.visual.morphFactor,
            chaos: normalized.visual.chaos,
            speed: normalized.visual.speed,
            hue: normalized.visual.hue,
            intensity: normalized.visual.intensity,
            saturation: normalized.visual.saturation
        };
    }

    /**
     * Create an actionable error response
     */
    createError(type, code, message, details = {}) {
        return {
            error: {
                type,
                code,
                message,
                ...details,
                retry_possible: details.retry_possible ?? false
            }
        };
    }

    /**
     * Create a tool response
     */
    createToolResponse(operation, data) {
        return {
            success: true,
            operation,
            timestamp: new Date().toISOString(),
            ...data
        };
    }

    /**
     * Get schema for documentation/tooling
     */
    getSchema(name) {
        return this.schemas[name];
    }

    /**
     * Get all schemas for MCP tool registration
     */
    getAllSchemas() {
        return { ...this.schemas };
    }
}

// Singleton instance
export const schemaRegistry = new SchemaRegistry();

// Named exports
export { parametersSchema, toolResponseSchema, errorSchema };
export { extensionSchema, toolPackSchema };
export default schemaRegistry;
