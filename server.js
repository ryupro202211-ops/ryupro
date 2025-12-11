const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'ryuproHP');

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);


    // API Endpoint: /api/posts
    if (req.url === '/api/posts') {
        if (req.method === 'GET') {
            const dataPath = path.join(PUBLIC_DIR, 'blog', 'data', 'posts.json');
            fs.readFile(dataPath, 'utf8', (err, data) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Internal Server Error' }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(data);
            });
            return;
        } else if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
                try {
                    // Increase limit logic implicitly handled by node stream, but large images might be slow.
                    // Ideally we handle large payloads better, but for single user it's fine.

                    const postData = JSON.parse(body);
                    const postsJsonPath = path.join(PUBLIC_DIR, 'blog', 'data', 'posts.json');

                    fs.readFile(postsJsonPath, 'utf8', (err, data) => {
                        if (err) throw err;
                        let posts = JSON.parse(data);

                        let id = postData.id;
                        let imageUrl = postData.currentImage || "https://images.unsplash.com/photo-1497366216548-37526070297c?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80";

                        // Handle Image Upload (Base64)
                        if (postData.imageFile) {
                            // Expect data:image/png;base64,.....
                            const matches = postData.imageFile.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                            if (matches && matches.length === 3) {
                                const buffer = Buffer.from(matches[2], 'base64');
                                const extension = matches[1].split('/')[1]; // e.g., 'png'
                                const filename = `image-${Date.now()}.${extension}`;
                                const uploadPath = path.join(PUBLIC_DIR, 'assets', 'uploads', filename);

                                fs.writeFileSync(uploadPath, buffer);
                                imageUrl = `assets/uploads/${filename}`;
                            }
                        }

                        // Determine if Create or Update
                        let isUpdate = false;
                        if (id) {
                            // Update existing
                            const index = posts.findIndex(p => p.id === id);
                            if (index !== -1) {
                                posts[index] = {
                                    ...posts[index],
                                    title: postData.title,
                                    date: postData.date,
                                    excerpt: postData.excerpt,
                                    content: postData.content, // Save full content for editing
                                    image: imageUrl
                                };
                                isUpdate = true;
                            }
                        }

                        if (!isUpdate) {
                            // Create new
                            id = `${postData.date.replace(/\./g, '-')}-${Math.random().toString(36).substr(2, 5)}`;
                            const newPost = {
                                id: id,
                                title: postData.title,
                                date: postData.date,
                                excerpt: postData.excerpt,
                                content: postData.content, // Save full content for editing
                                image: imageUrl,
                                url: `posts/${id}.html`
                            };
                            posts.unshift(newPost);
                        }

                        // Save JSON
                        fs.writeFile(postsJsonPath, JSON.stringify(posts, null, 4), 'utf8', (err) => {
                            if (err) throw err;

                            // Generate HTML File
                            const templatePath = path.join(PUBLIC_DIR, 'blog', 'posts', 'template.html');
                            fs.readFile(templatePath, 'utf8', (err, template) => {
                                if (err) throw err;

                                // Fix relative path for image if it's uploaded (which is in assets/uploads, 2 levels up from posts/)
                                // Currently template assumes images are absolute URLs or relative.
                                // If imageUrl is 'assets/uploads/foo.jpg', from 'blog/posts/id.html', we need '../../assets/uploads/foo.html'
                                let relativeImgUrl = imageUrl;
                                if (!imageUrl.startsWith('http')) {
                                    relativeImgUrl = '../../' + imageUrl;
                                }

                                let html = template
                                    .replace(/{{TITLE}}/g, postData.title)
                                    .replace(/{{DATE}}/g, postData.date)
                                    // Simple hack to inject hero image if template supported it, 
                                    // but template currently uses hardcoded image or content images.
                                    // We will PREPEND the hero image to content if it's not standard.
                                    .replace(/{{CONTENT}}/g, `<img src="${relativeImgUrl}" style="width:100%; border-radius:8px; margin-bottom:2rem;">` + postData.content);

                                const newFilePath = path.join(PUBLIC_DIR, 'blog', 'posts', `${id}.html`);
                                fs.writeFile(newFilePath, html, 'utf8', (err) => {
                                    if (err) throw err;

                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true, id: id, isUpdate: isUpdate }));
                                });
                            });
                        });
                    });
                } catch (e) {
                    console.error(e);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to save post' }));
                }
            });
            return;
        } else if (req.method === 'DELETE') {
            // Parse ID from query string
            const queryIndex = req.url.indexOf('?');
            if (queryIndex === -1) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing ID' }));
                return;
            }

            const query = req.url.substring(queryIndex + 1);
            let id = null;
            query.split('&').forEach(part => {
                const [key, value] = part.split('=');
                if (key === 'id') id = value;
            });

            if (!id) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing ID' }));
                return;
            }

            const postsJsonPath = path.join(PUBLIC_DIR, 'blog', 'data', 'posts.json');
            fs.readFile(postsJsonPath, 'utf8', (err, data) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to read database' }));
                    return;
                }

                let posts = JSON.parse(data);
                const post = posts.find(p => p.id === id);

                if (!post) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Post not found' }));
                    return;
                }

                // Filter out the post
                posts = posts.filter(p => p.id !== id);

                // Save JSON
                fs.writeFile(postsJsonPath, JSON.stringify(posts, null, 4), 'utf8', (err) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Failed to update database' }));
                        return;
                    }

                    // Delete HTML file
                    // post.url is like "posts/id.html", so file is in "blog/posts/id.html"
                    const htmlPath = path.join(PUBLIC_DIR, 'blog', post.url);

                    if (fs.existsSync(htmlPath)) {
                        fs.unlink(htmlPath, (err) => {
                            if (err) console.error("Failed to delete file:", htmlPath);
                        });
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                });
            });
            return;
        }
    }

    // Static File Serving
    let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);

    // Handle URL cleaning (remove query params)
    const q = filePath.indexOf('?');
    if (q !== -1) {
        filePath = filePath.substring(0, q);
    }

    // Default to index.html if path is a directory (simple check)
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    const extname = path.extname(filePath);
    let contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // 404 Not Found
                fs.readFile(path.join(PUBLIC_DIR, '404.html'), (error, page) => {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end(page || '<h1>404 Not Found</h1>', 'utf-8');
                });
            } else {
                // 500 Internal Server Error
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            // Success
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`Serving files from: ${PUBLIC_DIR}`);
});
