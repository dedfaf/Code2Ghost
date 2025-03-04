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

const ERR_NO_EDITOR = 'No active editor found.';
const ERR_404 = 'Post not found. Do the post exist?';

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

	const update_post_current_editor = vscode.commands.registerCommand('code2ghost.updatePostCurrentEditor', async function () {
		updatePost(context);
	});

	const sync_post_current_editor = vscode.commands.registerCommand('code2ghost.syncPostCurrentEditor', async function () {
		syncPost(context);
	});

	context.subscriptions.push(set_config);
	context.subscriptions.push(get_config);
	context.subscriptions.push(create_post_current_editor_draft);
	context.subscriptions.push(create_post_current_editor_publish);
	context.subscriptions.push(get_post);
	context.subscriptions.push(update_post_current_editor);
	context.subscriptions.push(sync_post_current_editor);
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
			
			// Update front-matter
			// updateFM(res.data.posts[0]);
			// Update FM only causes updating image everytime. Sync the post, the front-matter, URL of image will be updated.
			syncPost(context);
			vscode.window.showInformationMessage('Created Post successful at ' + `[${bareUrl}/ghost/#/editor/post/${res.data.posts[0].id}](${bareUrl}/ghost/#/editor/post/${res.data.posts[0].id})`);
			// vscode.commands.executeCommand('workbench.action.closeActiveEditor');	
		}
	);
}

async function updatePost(context) {
	vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Updating Post...',
			cancellable: false
		},
		async (progress, token) => {
			const authToken = getAuthToken(context);
			const { bareUrl } = getConfig(context);

			const { html, FMtitle, FMauthors, FMtags, FMid, FMupdated_at, FMstatus } = await getEditor(bareUrl, authToken);

			const postTitle = FMtitle

			// Make an authenticated request to create a post
			const url = bareUrl + '/ghost/api/admin/posts/' + FMid + '/?source=html';
			const headers = { Authorization: `Ghost ${authToken}` };

			const postData = {
				title: postTitle,
				html: html,
				status: FMstatus,
				updated_at: FMupdated_at
			};

			if (FMauthors && Array.isArray(FMauthors) && FMauthors.length > 0) {
				postData.authors = FMauthors;
			}

			if (FMtags && Array.isArray(FMtags) && FMtags.length > 0) {
				postData.tags = FMtags;
			}

			const payload = { posts: [postData] };

			let res;
			try {
				res = await axios.put(url, payload, { headers });
			} catch (error) {
				console.error(error);
				if (error.response.status == 404) {
					vscode.window.showErrorMessage(ERR_404);
					return;
				}
				if (res.status == 409) {
					vscode.window.showErrorMessage('Post has been updated since you last get it, please get the post again and modify from the newer version.');
					return;
				}
				vscode.window.showErrorMessage('Failed to update post.');
				return;
			}
		
			// Update front-matter
			// updateFM(res.data.posts[0]);
			// Update FM only causes updating image everytime. Sync the post, the front-matter, URL of image will be updated.
			syncPost(context);
			vscode.window.showInformationMessage('Updated Post successful at ' + `[${bareUrl}/ghost/#/editor/post/${res.data.posts[0].id}](${bareUrl}/ghost/#/editor/post/${res.data.posts[0].id})`);
			// vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		}
	);
}

async function syncPost(context) {
	vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Syncing Post...',
			cancellable: false
		},
		async (progress, token) => {
			const FMid = getPostFM().id;
			const post = await getPostById(context, FMid);
			if (post) {
				if (post.updated_at == getPostFM().updated_at) {
					vscode.window.showInformationMessage('The post is already up-to-date.');
					return;
				}
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					const newContent = parseFM(post) + '\n' + turndownService.turndown(post.html);
					editor.edit(editBuilder => {
						const document = editor.document;
						const lastLine = document.lineAt(document.lineCount - 1);
						const range = new vscode.Range(new vscode.Position(0, 0), lastLine.range.end);
						editBuilder.delete(range);
						editBuilder.insert(new vscode.Position(0, 0), newContent);
					});
				} else {
					vscode.window.showInformationMessage(ERR_NO_EDITOR);
					return;
				}
			} else {
				return;
			}
			vscode.window.showInformationMessage('Post synced.');
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

function addFMcomment(FM) {
	const comment = `# This front-matter is generated by Code2Ghost.\n# Under any circumstances, please do not modify the \`url\` \`id\` \`updated_at\` fields (It will be readed when updating the post).\n# If you modify other parts, the changes will overwrite the original settings of the post, not merged.\n`;
	const commentPublish = `\n# If you set \`status\` to \`published\`, the post will be published.\n`
	var frontMatterString
	if (FM.status == `published`) {
		frontMatterString = matter.stringify('', FM).replace(/---\s*$/, comment + '---');
	} else {
		frontMatterString = matter.stringify('', FM).replace(/---\s*$/, comment + commentPublish + '---');
	}
	frontMatterString += `\n`;
	return frontMatterString
}

function parseFM(FMdata) {
	const showComment = vscode.workspace.getConfiguration().get('code2ghost.showFrontMatterComment');
	const FM = {
		id: FMdata.id,
		url: FMdata.url,
		updated_at: FMdata.updated_at,
		status: FMdata.status,
		title: FMdata.title,
		tags: FMdata.tags.map(tag => tag.name),
		authors: FMdata.authors.map(author => author.email)
	};
	if (showComment) {
		return addFMcomment(FM);
	} else {
		return matter.stringify('', FM);
	}
	
}

function updateFM(FMdata) {
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		const fileContent = editor.document.getText();
		const { data, content } = matter(fileContent);
		let newContent = parseFM(FMdata);
		if (!content.startsWith('\n')) {
			newContent += '\n';
		}
		newContent += content;
		editor.edit(editBuilder => {
			const document = editor.document;
			const lastLine = document.lineAt(document.lineCount - 1);
			const range = new vscode.Range(new vscode.Position(0, 0), lastLine.range.end);
			editBuilder.delete(range);
			editBuilder.insert(new vscode.Position(0, 0), newContent);
		});
	} else {
		vscode.window.showInformationMessage(ERR_NO_EDITOR);
	}
}

function getPostFM() {
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		const fileContent = editor.document.getText();
		const { data } = matter(fileContent);
		return data;
	} else {
		vscode.window.showInformationMessage(ERR_NO_EDITOR);
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
		const imageMatches = [...resolvedHtml.matchAll(/<img[^>]*src=["'](.*?)["'][^>]*>/g)]
			.map(match => match[1])
			.filter(imageUrl => !imageUrl.startsWith('http') && !imageUrl.startsWith('https'));

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
		// Post id will be readed when updating post.
		const FMid = data.id || null;
		// updated_at is necessary.
		const FMupdated_at = data.updated_at || null;
		// Post status is set by different command when creating post, and read by front-matter when updating post.
		const FMstatus = data.status || null;
		return { h1, html: resolvedHtmlWithoutTitle, FMtitle, FMauthors, FMtags, FMid, FMupdated_at, FMstatus };
	} else {
		vscode.window.showInformationMessage(ERR_NO_EDITOR);
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

			const content = parseFM(selectedPost)+ '\n' + PostMD;
			const document = await vscode.workspace.openTextDocument({ content: content, language: 'markdown' });
			await vscode.window.showTextDocument(document);
		}
	}
}

async function getPostById(context, id) {
	const authToken = getAuthToken(context);
	const { bareUrl } = getConfig(context);
	const url = bareUrl + '/ghost/api/admin/posts/' + id + '?formats=html';
	const headers = {
		Authorization: `Ghost ${authToken}`
	};
	let res;
	try {
		res = await axios.get(url, { headers });
	} catch (error) {
		if (error.response.status == 404) {
			vscode.window.showErrorMessage(ERR_404);
			return;
		}
		console.error(error);
		vscode.window.showErrorMessage('Failed to sync posts.');
		return;
	}
	return res.data.posts[0];
}

module.exports = {
	activate,
	deactivate
}