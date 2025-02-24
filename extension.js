const vscode = require('vscode');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const marked = require('marked');
const matter = require('gray-matter');
const turndown = require('turndown');
const turndownService = new turndown(
	{
		headingStyle: 'atx'
	}
);
const crypto = require('crypto');
const algorithm = 'aes-256-cbc';
const secretKey = vscode.workspace.getConfiguration().get('code2ghost.secretKey');
const iv = crypto.randomBytes(16);


/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	const set_config = vscode.commands.registerCommand('code2ghost.setConfig', async function () {
		vscode.window.showInformationMessage('Setting Config...');
		const url = await vscode.window.showInputBox({ prompt: 'Enter API URL' });
		const key = await vscode.window.showInputBox({ prompt: 'Enter Admin API key' });
		setConfig(context, url, key);
	});

	const get_config = vscode.commands.registerCommand('code2ghost.getConfig', function () {
		const { bareUrl, key } = getConfig(context);
		vscode.window.showInformationMessage(`URL: ${bareUrl}, Key: ${key}`);
	});

	const create_post_current_editor_draft = vscode.commands.registerCommand('code2ghost.createPostCurrentEditorDraft', async function () {
		// vscode.window.showInformationMessage('Creating Post...');
		createPost(context, 0);	
	});

	const create_post_current_editor_publish = vscode.commands.registerCommand('code2ghost.createPostCurrentEditorPublish', async function () {
		// vscode.window.showInformationMessage('Creating Post...');
		createPost(context, 1);
	});	

	const get_post = vscode.commands.registerCommand('code2ghost.getPost', function () {
		getPost(context);
	});

	context.subscriptions.push(set_config);
	context.subscriptions.push(get_config);
	context.subscriptions.push(create_post_current_editor_draft);
	context.subscriptions.push(create_post_current_editor_publish);
	context.subscriptions.push(get_post);
}

function deactivate() {}

function setConfig(context, url, key) {
	context.globalState.update('ghostUrl', url);
	context.globalState.update('ghostAdminKey', encrypt(key));
}

function getConfig(context) {
	const bareUrl = context.globalState.get('ghostUrl');
	const key = decrypt(context.globalState.get('ghostAdminKey'));
	return { bareUrl, key };
}

function encrypt(text) {
    let cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
    let encrypted = cipher.update(text, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
    let textParts = text.split(':');
    let iv = Buffer.from(textParts.shift(), 'hex');
    let encryptedText = textParts.join(':');
    let decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
}

function getAuthToken(context) {
	const { key } = getConfig(context);
			
	// Split the key into ID and SECRET
	const [id, secret] = key.split(':');	

	// Create the token (including decoding secret)
	const authToken = jwt.sign({}, Buffer.from(secret, 'hex'), {
		keyid: id,
		algorithm: 'HS256',
		expiresIn: '5m',
		audience: `/admin/`
	});
	return authToken;
};

async function createPost(context, publish) {
	
	vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Creating Post...',
			cancellable: false
		},
		async (progress, token) => {
			const authToken = getAuthToken(context);
			const { bareUrl } = getConfig(context);

			const { h1, html, FMtitle, FMauthors, FMtags } = await getEditor(bareUrl, authToken);

			// if title is provided in the front matter, title of the post won't be asked.
			var postTitle = null
			if (FMtitle) {
				postTitle = FMtitle;
			} else {
				postTitle = await vscode.window.showInputBox({ prompt: 'Enter Post Title', value: h1 });
				if (!postTitle) {
					vscode.window.showInformationMessage('Post creation cancelled.');
					return;
				}
			}

			// Make an authenticated request to create a post
			const url = bareUrl + '/ghost/api/admin/posts/?source=html';
			const headers = { Authorization: `Ghost ${authToken}` };
			// const payload = {
			// 	posts: [{
			// 		title: postTitle,
			// 		html: html,
			// 		authors: Array.isArray(FMauthors) ? FMauthors : [FMauthors],
			// 		tags: Array.isArray(FMtags) ? FMtags : [FMtags]
			// 	}]
			// };

			const postData = {
				title: postTitle,
				html: html
			};

			if (FMauthors && Array.isArray(FMauthors) && FMauthors.length > 0) {
				postData.authors = FMauthors;
			}

			if (FMtags && Array.isArray(FMtags) && FMtags.length > 0) {
				postData.tags = FMtags;
			}

			if (publish) {
				postData.status = "published";
			}

			const payload = { posts: [postData] };

			let res;
			try {
				res = await axios.post(url, payload, { headers });
			} catch (error) {
				console.error(error);
				vscode.window.showErrorMessage('Failed to create post.');
				return;
			}
			
			if (res.status != 201) {
				vscode.window.showErrorMessage('Failed to create post.');
			} else {
				vscode.window.showInformationMessage('Created Post successful at ' + `[${bareUrl}/ghost/#/editor/post/${res.data.posts[0].id}](${bareUrl}/ghost/#/editor/post/${res.data.posts[0].id})`);
				// vscode.commands.executeCommand('workbench.action.closeActiveEditor');	
			}
		}
	);
}

async function uploadImage(filePath, imageUrl, authToken, bareUrl) {
    const fs = require('fs');
    const path = require('path');
    const axios = require('axios');
    const FormData = require('form-data');

    try {
		const imagePath = path.resolve(filePath, imageUrl);
        const image = fs.createReadStream(imagePath);
        
        // Prepare FormData
        const form = new FormData();
        form.append('file', image);
        form.append('ref', imageUrl); 

        const uploadUrl = `${bareUrl}/ghost/api/admin/images/upload/`;
        const headers = {
            ...form.getHeaders(),
            Authorization: `Ghost ${authToken}`,
            'Accept-Version': 'v3',
        };

        const response = await axios.post(uploadUrl, form, { headers });
        return response.data;
    } catch (error) {
        console.error('Image upload failed:', error);
        throw new Error('Failed to upload image');
    }
}

async function getEditor(bareUrl, authToken) {
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		const filePath = editor.document.fileName.replace(/[^/\\]*$/, '');
		const fileContent = editor.document.getText();

		const { data, content } = matter(fileContent);
		
		const html = marked.parse(content);
		var resolvedHtml = await html;

		// Get all images
		// const imageMatches = [...fileContent.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map(match => match[2]);
		const imageMatches = [...resolvedHtml.matchAll(/<img[^>]*src=["'](.*?)["'][^>]*>/g)].map(match => match[1]);

		const uploadedImages = {};
        for (let imageUrl of imageMatches) {
            try {
                const uploadedData = await uploadImage(filePath, imageUrl, authToken, bareUrl);
                const ghostImageUrl = uploadedData.images[0].url; // Get URL in Ghost
                uploadedImages[imageUrl] = ghostImageUrl;

                // Replace html
                resolvedHtml = resolvedHtml.replace(imageUrl, ghostImageUrl);
            } catch (error) {
                console.error(`Failed to upload image: ${imageUrl}`);
            }
		}
		
		// TODO: Use a more efficiency way to identifiy title
		const h1Match = resolvedHtml.match(/<h1.*?>(.*?)<\/h1>/);
		const h1 = h1Match ? h1Match[1] : 'Untitled';

		const resolvedHtmlWithoutTitle = resolvedHtml.replace(/<h1.*?>(.*?)<\/h1>/, '');

		const FMtitle = data.title || null;
		const FMauthors = data.authors || null;
		const FMtags = data.tags || null;
		return { h1, html: resolvedHtmlWithoutTitle, FMtitle, FMauthors, FMtags };
	} else {
		vscode.window.showInformationMessage('No file is currently open.');
	}
}

async function getPosts(context) {
	const authToken = getAuthToken(context);
	const { bareUrl } = getConfig(context);
	const url = bareUrl + '/ghost/api/admin/posts/?formats=html';
	const headers = { Authorization: `Ghost ${authToken}` };
	let res;
	try {
		res = await axios.get(url, { headers });
	} catch (error) {
		console.error(error);
		vscode.window.showErrorMessage('Failed to get posts.');
		return;
	}
	// console.log(res.data.posts);
	return res.data.posts;
}

async function getPost(context) {
	const posts = await getPosts(context);
	if (posts) {
		const postTitles = posts.map(post => post.title);
		const selectedPostTitle = await vscode.window.showQuickPick(postTitles, { placeHolder: 'Select a post to open' });
		if (selectedPostTitle) {
			const selectedPost = posts.find(post => post.title === selectedPostTitle);
			// const { bareUrl } = getConfig(context);
			// vscode.env.openExternal(vscode.Uri.parse(`${bareUrl}/ghost/#/editor/post/${selectedPost.id}`));
			const PostMD = turndownService.turndown(selectedPost.html);
			const frontMatter = {
				id: selectedPost.id,
				url: selectedPost.url,
				status: selectedPost.status,
				title: selectedPost.title,
				tags: selectedPost.tags.map(tag => tag.name),
				authors: selectedPost.authors.map(author => author.name)
			};
			const comment = `# This front-matter is generated by Code2Ghost.\n# Under any circumstances, please do not modify the \`url\` and \`id\` fields.\n# If you modify other parts, the changes will overwrite the original settings of the post, not merged.\n`;
			const frontMatterString = matter.stringify('', frontMatter).replace(/---\s*$/, comment + '---');
			const documentContent = frontMatterString + '\n' + PostMD;
			const document = await vscode.workspace.openTextDocument({ content: documentContent, language: 'markdown' });
			await vscode.window.showTextDocument(document);
		}
	}
}

module.exports = {
	activate,
	deactivate
}