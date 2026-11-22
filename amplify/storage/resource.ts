import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'photoBucket',
  access: (allow) => ({
    'pictures/*': [
      allow.authenticated.to(['read', 'write']),
      allow.groups(['Users']).to(['read', 'write']),
      allow.groups(['Admins']).to(['read', 'write', 'delete']),
    ],
  }),
});
