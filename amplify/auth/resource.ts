import { defineAuth, secret } from '@aws-amplify/backend';
import { postConfirmation } from './post-confirmation/resource';

export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: {
      google: {
        clientId: secret('GOOGLE_CLIENT_ID'),
        clientSecret: secret('GOOGLE_CLIENT_SECRET'),
        scopes: ['email', 'profile'],
      },
      // Add your live Amplify URL here later (Step 29), keep the trailing "/"
      callbackUrls: [
        'http://localhost:5173/',
        'https://main.dzhhl0srd1h1c.amplifyapp.com/',
      ],
      logoutUrls: [
        'http://localhost:5173/',
        'https://main.dzhhl0srd1h1c.amplifyapp.com/',
      ],
    },
  },
  groups: ['Admins', 'Users'],
  triggers: { postConfirmation },
  access: (allow) => [allow.resource(postConfirmation).to(['addUserToGroup'])],
});
