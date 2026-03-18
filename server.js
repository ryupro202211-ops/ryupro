const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3001;

// Middleware to parse JSON and static files
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// Paths
const DATA_FILE = path.join(__dirname, 'blog/data/posts.json');
const UPLOADS_DIR = path.join(__dirname, 'assets/uploads');
const POSTS_DIR = path.join(__dirname, 'blog/posts');
const TEMPLATE_FILE = path.join(POSTS_DIR, 'template.html');

// Allowed image extensions
const ALLOWED_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

// Helper: Sanitize filename to prevent path traversal
function sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '');
}

// Helper: Generate HTML
function generatePostHtml(post, callback) {
    fs.readFile(TEMPLATE_FILE, 'utf8', (err, template) => {
        if (err) {
            if (callback) callback(err);
            return;
        }

        let html = template
            .replace(/{{TITLE}}/g, post.title)
            .replace(/{{DATE}}/g, post.date)
            .replace(/{{CONTENT}}/g, post.content || "");

        // Determine filename
        let fileName = post.url.split('/').pop();

        // Safety check: Never overwrite template.html
        if (fileName === 'template.html') {
            console.warn(`Warning: Post ${post.id} tries to write to template.html. Redirecting to ${post.id}.html`);
            fileName = `${post.id}.html`;
        }

        fileName = sanitizeFilename(fileName);
        const filePath = path.join(POSTS_DIR, fileName);

        // Verify the resolved path is within POSTS_DIR
        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(path.resolve(POSTS_DIR))) {
            if (callback) callback(new Error('Invalid file path'));
            return;
        }

        fs.writeFile(filePath, html, 'utf8', (err) => {
            if (callback) callback(err);
        });
    });
}

// Regenerate all posts on startup
if (fs.existsSync(DATA_FILE)) {
    try {
        const posts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        posts.forEach(post => {
            generatePostHtml(post, (err) => {
                if (err) console.error(`Failed to generate HTML for ${post.title}`, err);
            });
        });
        console.log(`Regenerated HTML for ${posts.length} posts.`);
    } catch (e) {
        console.error("Failed to regenerate posts on startup:", e);
    }
}

// Ensure directories exist
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// --- API Routes ---

// 1. Get All Posts
app.get('/api/posts', (req, res) => {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to read posts data' });
        }
        const posts = JSON.parse(data);
        // Sort by date descending
        posts.sort((a, b) => {
            const dateA = a.date.replace(/\./g, '-');
            const dateB = b.date.replace(/\./g, '-');
            return dateB.localeCompare(dateA);
        });
        res.json(posts);
    });
});

// 2. Create or Update Post
app.post('/api/posts', (req, res) => {
    const { id, title, date, excerpt, content, imageFile, currentImage } = req.body;

    // Basic validation
    if (!title || !date || !excerpt) {
        return res.status(400).json({ error: 'Missing required fields: title, date, excerpt' });
    }

    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to read posts data' });
        }

        let posts = JSON.parse(data);
        let post = posts.find(p => p.id === id);
        let imagePath = currentImage;

        // Handle Image Upload
        if (imageFile) {
            try {
                const matches = imageFile.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    const ext = matches[1].split('/')[0].toLowerCase();
                    if (!ALLOWED_IMAGE_EXTS.has(ext)) {
                        return res.status(400).json({ error: 'Unsupported image format' });
                    }
                    const buffer = Buffer.from(matches[2], 'base64');
                    // Limit file size to 5MB
                    if (buffer.length > 5 * 1024 * 1024) {
                        return res.status(400).json({ error: 'Image too large (max 5MB)' });
                    }
                    const fileName = `img_${Date.now()}.${ext}`;
                    const filePath = path.join(UPLOADS_DIR, fileName);

                    fs.writeFileSync(filePath, buffer);
                    imagePath = `/assets/uploads/${fileName}`;
                }
            } catch (e) {
                console.error("Image upload failed", e);
            }
        }

        if (post) {
            // Update existing
            post.title = title;
            post.date = date;
            post.excerpt = excerpt;
            post.content = content;
            post.image = imagePath;
        } else {
            // Create new
            const newId = generateId(date);
            post = {
                id: newId,
                title,
                date,
                excerpt,
                content,
                image: imagePath,
                url: `posts/${newId}.html`
            };
            posts.unshift(post);
        }

        // Save JSON
        fs.writeFile(DATA_FILE, JSON.stringify(posts, null, 4), 'utf8', (err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to save posts data' });
            }

            // Generate HTML File
            generatePostHtml(post, (err) => {
                if (err) {
                    console.error("HTML Generation failed", err);
                    return res.status(500).json({ error: 'Saved JSON but failed to generate HTML' });
                }
                res.json({ success: true, post });
            });
        });
    });
});

// 3. Delete Post
app.delete('/api/posts', (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing ID' });

    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Read error' });

        let posts = JSON.parse(data);
        const postIndex = posts.findIndex(p => p.id === id);

        if (postIndex === -1) {
            return res.status(404).json({ error: 'Post not found' });
        }

        const post = posts[postIndex];

        // Remove from array
        posts.splice(postIndex, 1);

        // Save JSON
        fs.writeFile(DATA_FILE, JSON.stringify(posts, null, 4), 'utf8', (err) => {
            if (err) return res.status(500).json({ error: 'Write error' });

            // Delete HTML file
            if (post.url && post.url.startsWith('posts/')) {
                const htmlFileName = sanitizeFilename(post.url.split('/').pop());
                const htmlPath = path.join(POSTS_DIR, htmlFileName);
                const resolvedPath = path.resolve(htmlPath);

                if (resolvedPath.startsWith(path.resolve(POSTS_DIR)) && fs.existsSync(htmlPath)) {
                    fs.unlinkSync(htmlPath);
                }
            }

            res.json({ success: true });
        });
    });
});

// Helper: Generate ID
function generateId(dateStr) {
    const datePart = dateStr.replace(/\./g, '-');
    const randomPart = Math.random().toString(36).substr(2, 5);
    return `${datePart}-${randomPart}`;
}

// Start Server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
