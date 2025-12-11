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
            // Note: We are not updating the JSON here, so this is a temporary fix for file generation.
            // Ideally JSON should be updated too, but we did a bulk update in JSON already.
        }

        const filePath = path.join(POSTS_DIR, fileName);
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
        res.json(JSON.parse(data));
    });
});

// 2. Create or Update Post
app.post('/api/posts', (req, res) => {
    const { id, title, date, excerpt, content, imageFile, currentImage } = req.body;

    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to read posts data' });
        }

        let posts = JSON.parse(data);
        let post = posts.find(p => p.id === id);
        let isNew = false;
        let imagePath = currentImage; // Default to existing image

        // Handle Image Upload
        if (imageFile) {
            try {
                // Remove header "data:image/jpeg;base64,"
                const matches = imageFile.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    const ext = matches[1];
                    const buffer = Buffer.from(matches[2], 'base64');
                    const fileName = `img_${Date.now()}.${ext}`;
                    const filePath = path.join(UPLOADS_DIR, fileName);

                    fs.writeFileSync(filePath, buffer);
                    imagePath = `/assets/uploads/${fileName}`; // Root relative path for web
                }
            } catch (e) {
                console.error("Image upload failed", e);
                // Continue without failing the whole request, keep old image
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
            isNew = true;
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
            posts.unshift(post); // Add to top
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
                const htmlPath = path.join(__dirname, 'blog', post.url);
                if (fs.existsSync(htmlPath)) {
                    fs.unlinkSync(htmlPath);
                }
            }

            // Optional: Delete image if local (complex logic omitted for safety)

            res.json({ success: true });
        });
    });
});

// Helper: Generate ID
function generateId(dateStr) {
    // 2024.12.11 -> 2024-12-11-xxxxx
    const datePart = dateStr.replace(/\./g, '-');
    const randomPart = Math.random().toString(36).substr(2, 5);
    return `${datePart}-${randomPart}`;
}

// Start Server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
