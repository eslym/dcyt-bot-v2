import { z } from 'zod';

export const startOptions = z.object({
    token: z.string({ required_error: 'Token must be present' }).min(1, 'Token must not be empty'),
    websub: z
        .string({ required_error: 'Websub origin must be present' })
        .min(1, 'Websub origin must not be empty')
        .url('Websub origin must be a valid URL'),
    host: z.string({ required_error: 'Host must be present' }).min(1, 'Host must not be empty'),
    port: z.coerce
        .number({ required_error: 'Port must be present' })
        .int('Port must be an integer')
        .min(1, 'Port must be a positive integer')
        .max(65535, 'Port must be less than 65536'),
    database: z.string({ required_error: 'Database path must be present' }).min(1, 'Database path must not be empty'),
    gapiToken: z
        .string({ required_error: 'Google API token must be present' })
        .min(1, 'Google API token must not be empty')
});

export type StartOptions = z.infer<typeof startOptions>;
