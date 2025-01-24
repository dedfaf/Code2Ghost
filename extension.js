// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "code2ghost" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('code2ghost.helloWorld', function () {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from Code2Ghost!');
	});

	const getJwt = vscode.commands.registerCommand('code2ghost.getJwt', function () {
		// The code you place here will be executed every time your command is executed
		vscode.window.showInformationMessage('Getting JWT from Ghost...');

		const adminApiKey = '';

		const [id, secret] = adminApiKey.split(':');

		const token = jwt.sign(
			{
				aud: '/v5/admin/',
				iss: id,
			},
			Buffer.from(secret, 'hex'),
			{
				algorithm: 'HS256',
				expiresIn: '5m',
			}
		);

		console.log('JWT Token:', token);
		vscode.window.showInformationMessage('JWT Token: ' + token);
	});

	const createPost = vscode.commands.registerCommand('code2ghost.createPost', function () {
		// The code you place here will be executed
		vscode.window.showInformationMessage('Creating Post...');

		// Admin API key goes here
		const key = '';

		// Split the key into ID and SECRET
		const [id, secret] = key.split(':');

		// Create the token (including decoding secret)
		const token = jwt.sign({}, Buffer.from(secret, 'hex'), {
			keyid: id,
			algorithm: 'HS256',
			expiresIn: '5m',
			audience: `/admin/`
		});

		// Make an authenticated request to create a post
		const url = 'https://your.url/ghost/api/admin/posts/';
		const headers = { Authorization: `Ghost ${token}` };
		const payload = { posts: [{ title: 'Hello World' }] };
		axios.post(url, payload, { headers })
			.then(response => console.log(response))
			.catch(error => console.error(error));
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(getJwt);
	context.subscriptions.push(createPost);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
