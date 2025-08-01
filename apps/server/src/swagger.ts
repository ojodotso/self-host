import swaggerJSDoc from 'swagger-jsdoc';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'oJo API',
      version: '1.0.0',
      description: 'The self-host version of oJo',
      contact: {
        name: 'Looking for a managed version?',
        url: 'https://ojo.so',
      },
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:3001',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        AdminAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'authorization',
          description: 'Admin token for protected endpoints',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'boolean',
              example: true,
            },
            message: {
              type: 'string',
              example: 'Error message',
            },
            logs: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
          },
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
            },
          },
        },
        ImageResponse: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'abc123.png',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Template: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'template-123',
            },
            name: {
              type: 'string',
              example: 'My Template',
            },
            html: {
              type: 'string',
              description: 'Base64 encoded HTML content',
            },
            variables: {
              type: 'object',
              additionalProperties: {
                type: 'string',
              },
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
    },
  },
  apis: ['./src/docs/**/*.yaml'],
};

export const specs = swaggerJSDoc(options);
