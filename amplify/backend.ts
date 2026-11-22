import { defineBackend } from '@aws-amplify/backend';
import { Stack } from 'aws-cdk-lib';
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  Cors,
  LambdaIntegration,
  RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import {
  Alarm,
  ComparisonOperator,
  Dashboard,
  GraphWidget,
} from 'aws-cdk-lib/aws-cloudwatch';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { postConfirmation } from './auth/post-confirmation/resource';
import { apiFunction } from './api-function/resource';
// tells TypeScript that Node's "process" exists (it does at build time)
declare const process: { env: Record<string, string | undefined> };

const backend = defineBackend({
  auth,
  data,
  storage,
  postConfirmation,
  apiFunction,
});

// ---------- REST API (API Gateway + Lambda, Cognito-protected) ----------
const apiStack = backend.createStack('rest-api-stack');
const restApi = new RestApi(apiStack, 'RestApi', {
  restApiName: 'photoApi',
  deployOptions: { stageName: 'dev' },
  defaultCorsPreflightOptions: {
    allowOrigins: Cors.ALL_ORIGINS,
    allowMethods: Cors.ALL_METHODS,
    allowHeaders: [...Cors.DEFAULT_HEADERS, 'Authorization'],
  },
});
const integration = new LambdaIntegration(backend.apiFunction.resources.lambda);
const authorizer = new CognitoUserPoolsAuthorizer(apiStack, 'Authorizer', {
  cognitoUserPools: [backend.auth.resources.userPool],
});
const opts = { authorizationType: AuthorizationType.COGNITO, authorizer };
restApi.root.addResource('stats').addMethod('GET', integration, opts);
restApi.root.addResource('admin').addMethod('GET', integration, opts);

backend.addOutput({
  custom: {
    API: {
      photoApi: {
        endpoint: restApi.url,
        region: Stack.of(restApi).region,
        apiName: 'photoApi',
      },
    },
  },
});

// ---------- CloudWatch dashboard + alarm ----------
const monStack = backend.createStack('monitoring');
const fn = backend.apiFunction.resources.lambda;
const envName = (process.env.AWS_BRANCH ?? 'sandbox').replace(/[^a-zA-Z0-9_-]/g, '-');
const dash = new Dashboard(monStack, 'Dashboard', {
  dashboardName: `PhotoAppDashboard-${envName}`,
});
dash.addWidgets(
  new GraphWidget({
    title: 'REST Lambda invocations / errors',
    left: [fn.metricInvocations(), fn.metricErrors()],
  }),
  new GraphWidget({
    title: 'API Gateway requests / 5xx errors',
    left: [restApi.metricCount(), restApi.metricServerError()],
  })
);
new Alarm(monStack, 'LambdaErrorAlarm', {
  metric: fn.metricErrors(),
  threshold: 1,
  evaluationPeriods: 1,
  comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
  alarmDescription: 'REST Lambda reported an error',
});
