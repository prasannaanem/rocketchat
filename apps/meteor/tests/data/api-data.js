import supertest from 'supertest';

import { publicChannelName, privateChannelName } from './channel';
import { roleNameUsers, roleNameSubscriptions, roleScopeUsers, roleScopeSubscriptions, roleDescription } from './role';
import { username, email, adminUsername, adminPassword } from './user';

const apiUrl = process.env.TEST_API_URL || 'http://localhost:3000';

export const request = supertest(apiUrl);
const prefix = '/api/v1/';

export function wait(cb, time) {
	return () => setTimeout(cb, time);
}

export const apiUsername = `api${username}-${Date.now()}`;
export const apiEmail = `api${email}-${Date.now()}`;
export const apiPrivateChannelName = `api${privateChannelName}-${Date.now()}`;

export const apiRoleNameUsers = `api${roleNameUsers}`;
export const apiRoleNameSubscriptions = `api${roleNameSubscriptions}`;
export const apiRoleScopeUsers = `${roleScopeUsers}`;
export const apiRoleScopeSubscriptions = `${roleScopeSubscriptions}`;
export const apiRoleDescription = `api${roleDescription}`;
export const reservedWords = ['admin', 'administrator', 'system', 'user'];

export const group = {};
export const message = {};
export const directMessage = {};
export const integration = {};
/** @type {{ 'X-Auth-Token': string | undefined; 'X-User-Id': string | undefined }} */
export const credentials = {
	'X-Auth-Token': undefined,
	'X-User-Id': undefined,
};
export const login = {
	user: adminUsername,
	password: adminPassword,
};

export function api(path) {
	return prefix + path;
}

export function methodCall(methodName) {
	return api(`method.call/${methodName}`);
}

export function methodCallAnon(methodName) {
	return api(`method.callAnon/${methodName}`);
}

export function log(res) {
	console.log(res.req.path);
	console.log({
		body: res.body,
		headers: res.headers,
	});
}

export function getCredentials(done = function () {}) {
	request
		.post(api('login'))
		.send(login)
		.expect('Content-Type', 'application/json')
		.expect(200)
		.expect((res) => {
			credentials['X-Auth-Token'] = res.body.data.authToken;
			credentials['X-User-Id'] = res.body.data.userId;
		})
		.end(done);
}
