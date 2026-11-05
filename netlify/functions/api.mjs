import {handleRequest} from '../../server/api.mjs';

export default async (request, context) => handleRequest(request, {ip: context.ip});
