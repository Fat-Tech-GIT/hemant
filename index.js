require('dotenv').config();
const imap = require('imap-simple');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios');

// Configuration for IMAP
const config = {
    imap: {
        user: process.env.IMAP_USER,
        password: process.env.IMAP_PASS,
        host: process.env.IMAP_HOST,
        port: process.env.IMAP_PORT,
        tls: true,
        authTimeout: 3000,
    }
};

// Helper function to download and save attachments
const saveAttachment = (attachment, filename) => {
    return new Promise((resolve, reject) => {
        const filepath = path.join(__dirname, 'uploads', filename);
        fs.writeFile(filepath, attachment, 'base64', (err) => {
            if (err) return reject(err);
            console.log(`Attachment saved to ${filepath}`);
            resolve(filepath);
        });
    });
};

// Parse the CSV file and send data to API
const processCSV = (filepath) => {
    const results = [];

    fs.createReadStream(filepath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
            console.log('CSV Parsed:', results);

            // Send data to API
            axios.post(process.env.API_URL, results)
                .then((response) => {
                    console.log('Data sent to API:', response.data);
                })
                .catch((error) => {
                    console.error('Error sending data to API:', error);
                });
        });
};

// Connect to the IMAP server
imap.connect(config).then((connection) => {
    return connection.openBox('INBOX').then(() => {
        const searchCriteria = ['UNSEEN']; // Search for unread emails
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT'],
            struct: true,
        };

        return connection.search(searchCriteria, fetchOptions).then((messages) => {
            messages.forEach((message) => {
                const parts = imap.getParts(message.attributes.struct);
                
                parts.forEach((part) => {
                    // Look for attachments with CSV type
                    if (part.disposition && part.disposition.type.toUpperCase() === 'ATTACHMENT' && part.disposition.params.filename.endsWith('.csv')) {
                        connection.getPartData(message, part).then((attachmentData) => {
                            const filename = part.disposition.params.filename;
                            
                            saveAttachment(attachmentData, filename).then((filepath) => {
                                processCSV(filepath); // Process the CSV file after saving it
                            }).catch((err) => console.error('Error saving attachment:', err));
                        });
                    }
                });
            });
        });
    });
}).catch((err) => {
    console.error('Error connecting to IMAP:', err);
});
