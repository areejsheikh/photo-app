import type { APIGatewayProxyHandler } from 'aws-lambda';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  const claims = event.requestContext.authorizer?.claims ?? {};
  const groups = claims['cognito:groups'] ?? '';
  console.log(
    JSON.stringify({
      msg: 'api called',
      path: event.path,
      user: claims.email,
      groups,
    }),
  );

  const isAdmin = String(groups).includes('Admins');
  if (event.path.endsWith('/admin') && !isAdmin) {
    return {
      statusCode: 403,
      headers: cors,
      body: JSON.stringify({ error: 'Admins only' }),
    };
  }
  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({
      email: claims.email,
      groups,
      serverTime: new Date().toISOString(),
    }),
  };
};
