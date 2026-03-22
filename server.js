require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(express.json());
app.use(express.static('public'));
app.use(express.static('.'));

// --- MAIN CHECK-IN & AUTO-REGISTRATION ---
app.post('/check-in', async (req, res) => {
    const { fullName, identifier, college, userType, reason } = req.body;
    
    // 1. HARDCODED ADMIN LIST
    const adminEmails = [
        'jcesperanza@neu.edu.ph', 
        'isaiahlynel.pineda@neu.edu.ph',
        'janrey.maranan@neu.edu.ph'
    ]; 
    
    // Check if the current user should be an admin
    const shouldBeAdmin = adminEmails.includes(identifier);

    try {
        // 2. UPSERT: This creates the user if they don't exist, OR updates them if they do
        const { data: user, error: userError } = await supabase
            .from('visitors')
            .upsert({ 
                email: identifier, 
                full_name: fullName, 
                program_college: college, 
                user_type: userType,
                is_admin: shouldBeAdmin // Automatically sets true for the emails above
            }, { onConflict: 'email' })
            .select()
            .single();

        if (userError) return res.status(500).json({ message: "Database Error: " + userError.message });

        // 3. BLOCK CHECK: If you blocked them via the admin panel
        if (user.is_blocked) {
            return res.status(403).json({ message: "Access Denied: You are currently restricted from entry." });
        }

        // 4. LOG THE VISIT: Record why they are here
        await supabase.from('visit_logs').insert([{ visitor_id: user.id, reason: reason }]);

        // 5. SUCCESS RESPONSE
        res.json({ 
            message: "Welcome to NEU Library!",
            name: user.full_name,
            isAdmin: user.is_admin // The frontend will use this to show the Admin Button
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Connection Error" });
    }
});

// --- ADMIN DATA FETCH (CRITICAL FIX FOR BLOCK BUTTON) ---
app.get('/admin-stats', async (req, res) => {
    const { data, error } = await supabase
        .from('visit_logs')
        .select(`
            reason,
            created_at,
            visitors (full_name, email, program_college, user_type, is_blocked, is_admin)
        `) // added is_admin here
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json(error);
    res.json(data);
});

app.post('/toggle-block', async (req, res) => {
    const { email, blockStatus } = req.body;
    
    console.log(`Admin Action: Setting ${email} to blocked=${blockStatus}`); // For debugging

    const { error } = await supabase
        .from('visitors')
        .update({ is_blocked: blockStatus })
        .eq('email', email);

    if (error) {
        console.error("Supabase Update Error:", error.message);
        return res.status(500).json({ error: error.message });
    }
    
    res.json({ message: "Success" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));