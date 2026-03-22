require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- 1. THE MASTER ADMIN LIST (EDIT THIS ONLY) ---
const MASTER_ADMINS = [
    'jcesperanza@neu.edu.ph', 
    //'isaiahlynel.pineda@neu.edu.ph',
    'janrey.maranan@neu.edu.ph',
    'czesckahalie.bongco@neu.edu.ph'
];

// --- 2. THE AUTO-SYNC FUNCTION (RUNS ON STARTUP) ---
async function syncAdmins() {
    console.log("🔄 Starting Full Admin Sync...");

    // STEP A: Reset EVERYONE to false first (so old admins are removed)
    await supabase
        .from('visitors')
        .update({ is_admin: false })
        .not('email', 'in', `(${MASTER_ADMINS.join(',')})`); // Anyone NOT in your list becomes false

    // STEP B: Set your Master List to true
    for (const email of MASTER_ADMINS) {
        await supabase
            .from('visitors')
            .upsert({ 
                email: email.toLowerCase(), 
                is_admin: true,
                full_name: email.split('@')[0] 
            }, { onConflict: 'email' });
    }
    
    console.log("🏁 Supabase is now perfectly synced with your Code.");
}
syncAdmins(); // Execute immediately when server starts

app.use(express.json());
app.use(express.static('public'));
app.use(express.static('.'));

// --- MAIN CHECK-IN & AUTO-REGISTRATION ---
app.post('/check-in', async (req, res) => {
    const { fullName, identifier, college, userType, reason } = req.body;
    
    // Check master list
    const shouldBeAdmin = MASTER_ADMINS.includes(identifier.toLowerCase());

    try {
        const { data: user, error: userError } = await supabase
            .from('visitors')
            .upsert({ 
                email: identifier, 
                full_name: fullName, 
                program_college: college, 
                user_type: userType,
                is_admin: shouldBeAdmin 
            }, { onConflict: 'email' })
            .select()
            .single();

        if (userError) return res.status(500).json({ message: "Database Error: " + userError.message });
        if (user.is_blocked) return res.status(403).json({ message: "Access Denied." });

        await supabase.from('visit_logs').insert([{ visitor_id: user.id, reason: reason }]);

        res.json({ 
            message: "Welcome to NEU Library!",
            name: user.full_name,
            isAdmin: user.is_admin 
        });
    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
});

// --- ADMIN DATA FETCH ---
app.get('/admin-stats', async (req, res) => {
    const { data, error } = await supabase
        .from('visit_logs')
        .select(`
            reason,
            created_at,
            visitors (full_name, email, program_college, user_type, is_blocked, is_admin)
        `)
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json(error);
    res.json(data);
});

app.post('/toggle-block', async (req, res) => {
    const { email, blockStatus } = req.body;
    const { error } = await supabase
        .from('visitors')
        .update({ is_blocked: blockStatus })
        .eq('email', email);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Success" });
});

const PORT = process.env.PORT || 10000; // Use 10000 for Render
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));