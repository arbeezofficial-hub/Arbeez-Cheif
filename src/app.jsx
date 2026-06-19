react
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where 
} from 'firebase/firestore';

// Lucide Icons
import { 
  Compass, 
  BookOpen, 
  MessageSquare, 
  PlusCircle, 
  Heart, 
  User, 
  Settings, 
  Calendar, 
  ShoppingBag, 
  Cpu, 
  Search, 
  ChevronRight, 
  Clock, 
  Users, 
  Flame, 
  Award, 
  Check, 
  Trash2, 
  Share2, 
  Edit, 
  Printer, 
  ArrowLeft,
  Sparkles,
  ChevronDown,
  Info,
  LogOut,
  Send,
  Plus,
  Moon,
  Sun,
  Eye,
  Lock,
  Mail,
  UserCheck,
  EyeOff,
  ChefHat,
  Utensils
} from 'lucide-react';

// ==========================================
// FIREBASE & GLOBALS CONFIGURATION
// ==========================================
const firebaseConfig =
  typeof __firebase_config !== "undefined"
    ? JSON.parse(__firebase_config)
    : {
        apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
        authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
        databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
        projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
        storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.REACT_APP_FIREBASE_APP_ID,
        measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
      };

const appId =
  typeof __app_id !== "undefined"
    ? __app_id
    : "arbeez-chef-ai-prd-v2";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const apiKey = process.env.REACT_APP_FIREBASE_API_KEY;

// ==========================================
// DYNAMIC PLACEHOLDERS & AVATARS
// ==========================================
const recipeGradients = [
  "from-rose-400 to-orange-400",
  "from-emerald-400 to-teal-500",
  "from-violet-400 to-purple-500",
  "from-amber-400 to-yellow-500",
  "from-blue-400 to-indigo-500",
  "from-pink-400 to-rose-500",
  "from-cyan-400 to-blue-500"
];

const getInitials = (name) => {
  if (!name) return "CH";
  const parts = name.split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

const Avatar = ({ name, size = "w-10 h-10", textClass = "text-xs" }) => (
  <div className={`${size} rounded-full bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white font-black shadow-md border-2 border-white dark:border-slate-800 shrink-0`}>
    <span className={textClass}>{getInitials(name)}</span>
  </div>
);

const CoverPlaceholder = ({ gradientClass, children }) => (
  <div className={`w-full h-full bg-gradient-to-br ${gradientClass || recipeGradients[0]} flex items-center justify-center`}>
    {children || <Utensils className="w-12 h-12 text-white/30" />}
  </div>
);

// ==========================================
// UTILITY: GEMINI API WITH BACKOFF RETRY
// ==========================================
async function callGemini(prompt, systemInstruction = "") {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined
  };

  let delay = 1000;
  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
    } catch (e) {}
    await new Promise(res => setTimeout(res, delay));
    delay *= 2;
  }
  throw new Error("Unable to contact AI Chef Assistant.");
}

// ==========================================
// MAIN COMPONENT ENTRYPOINT
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);
  
  const [activeTab, setActiveTab] = useState("login");
  const [profile, setProfile] = useState({
    name: "Arbeez Guest",
    username: "guest_chef",
    bio: "Passionate Home Cook exploring gourmet landscapes",
    favoriteCuisines: ["Indian", "Italian", "Mexican"],
    dietaryPreferences: ["None"],
    allergies: []
  });

  const [selectedChefUsername, setSelectedChefUsername] = useState(null);
  const [selectedRecipeDetail, setSelectedRecipeDetail] = useState(null);

  // Firestore DB States
  const [recipes, setRecipes] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [mealPlan, setMealPlan] = useState({});
  const [shoppingList, setShoppingList] = useState([]);
  
  const [darkMode, setDarkMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Auth setup on startup
  useEffect(() => {
    const initAuthAndDB = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        }
      } catch (e) {
        console.error("Auth init failed:", e);
      }
    };
    initAuthAndDB();

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setAuthInitialized(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        setIsAnonymous(firebaseUser.isAnonymous);
        
        // Auto-navigate to dashboard if logged in and currently on login screen
        if (activeTab === "login") {
          setActiveTab("dashboard");
        }

        // Load Profile
        const profileDocRef = doc(db, 'artifacts', appId, 'users', firebaseUser.uid, 'profile', 'info');
        getDoc(profileDocRef).then((snap) => {
          if (snap.exists()) {
            setProfile(snap.data());
          } else {
            const initialProfile = {
              uid: firebaseUser.uid,
              name: firebaseUser.isAnonymous ? "Guest Chef" : (firebaseUser.displayName || `Chef_${firebaseUser.uid.substring(0, 5)}`),
              username: firebaseUser.isAnonymous ? "guest_chef" : `chef_${firebaseUser.uid.substring(0, 5)}`,
              bio: "Curator of taste & digital dining experiences.",
              coverGradient: recipeGradients[Math.floor(Math.random() * recipeGradients.length)],
              favoriteCuisines: ["Italian", "Indian", "Arabic"],
              dietaryPreferences: ["None"],
              allergies: [],
              joinedDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
            };
            setDoc(profileDocRef, initialProfile);
            setProfile(initialProfile);
          }
        });
      } else {
        setUser(null);
        setIsAnonymous(true);
        setActiveTab("login");
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Sync real-time Firestore collections
  useEffect(() => {
    if (!user) return;

    const recipesRef = collection(db, 'artifacts', appId, 'public', 'data', 'recipes');
    const unsubRecipes = onSnapshot(recipesRef, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => { list.push({ id: doc.id, ...doc.data() }); });
      setRecipes(list);
    }, (err) => console.error("Error reading recipes:", err));

    const favRef = collection(db, 'artifacts', appId, 'users', user.uid, 'favorites');
    const unsubFav = onSnapshot(favRef, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => { list.push({ id: doc.id, ...doc.data() }); });
      setFavorites(list);
    }, (err) => console.error("Error loading favorites:", err));

    const followersRef = collection(db, 'artifacts', appId, 'public', 'data', 'followers');
    const unsubFollowers = onSnapshot(followersRef, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => { list.push({ id: doc.id, ...doc.data() }); });
      setFollowers(list);
    }, (err) => console.error("Error loading followers:", err));

    const followingRef = collection(db, 'artifacts', appId, 'public', 'data', 'following');
    const unsubFollowing = onSnapshot(followingRef, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => { list.push({ id: doc.id, ...doc.data() }); });
      setFollowing(list);
    }, (err) => console.error("Error loading following:", err));

    const mealPlanDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'meal_plans', 'current');
    const unsubMeal = onSnapshot(mealPlanDoc, (snapshot) => {
      if (snapshot.exists()) { setMealPlan(snapshot.data()); }
    }, (err) => console.error("Error loading meal plans:", err));

    const shopListRef = collection(db, 'artifacts', appId, 'users', user.uid, 'shopping_lists');
    const unsubShop = onSnapshot(shopListRef, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => { list.push({ id: doc.id, ...doc.data() }); });
      setShoppingList(list);
    }, (err) => console.error("Error loading shopping list:", err));

    return () => {
      unsubRecipes();
      unsubFav();
      unsubFollowers();
      unsubFollowing();
      unsubMeal();
      unsubShop();
    };
  }, [user]);

  const handleLikeRecipe = async (recipeId) => {
    if (isAnonymous) {
      addToast("Please sign in to like community recipes!", "info");
      setActiveTab("login");
      return;
    }
    const targetRecipe = recipes.find(r => r.id === recipeId);
    if (!targetRecipe) return;

    const likesArray = targetRecipe.likes || [];
    const isLiked = likesArray.includes(user.uid);
    const updatedLikes = isLiked ? likesArray.filter(uid => uid !== user.uid) : [...likesArray, user.uid];

    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'recipes', recipeId);
      await updateDoc(docRef, { likes: updatedLikes });
      addToast(isLiked ? "Recipe unliked" : "Recipe liked!", "info");
    } catch (e) {
      addToast("Failed to update reaction", "error");
    }
  };

  const handleToggleFavorite = async (recipe) => {
    if (isAnonymous) {
      addToast("Please sign in to organize your cookbook!", "info");
      setActiveTab("login");
      return;
    }
    const existing = favorites.find(f => f.recipeId === recipe.id);
    try {
      if (existing) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'favorites', existing.id));
        addToast("Removed from Cookbook Favorites", "info");
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'favorites'), {
          recipeId: recipe.id,
          name: recipe.name,
          category: recipe.category || "General",
          cuisine: recipe.cuisine || "International",
          time: recipe.cookTime || recipe.totalTime || "30 mins",
          cover: recipe.cover || recipeGradients[0]
        });
        addToast("Added to Cookbook Favorites", "success");
      }
    } catch (e) { addToast("Error toggling favorite status", "error"); }
  };

  const handleFollowChef = async (chefUid, chefUsername) => {
    if (isAnonymous) {
      addToast("Please sign in to follow favorite chefs!", "info");
      setActiveTab("login");
      return;
    }
    if (chefUid === user.uid) return;
    const isAlreadyFollowing = following.some(f => f.chefUid === chefUid && f.followerUid === user.uid);
    
    try {
      if (isAlreadyFollowing) {
        const folSnap = following.find(f => f.chefUid === chefUid && f.followerUid === user.uid);
        if (folSnap) { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'following', folSnap.id)); }
        addToast(`Unfollowed @${chefUsername}`, "info");
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'following'), { followerUid: user.uid, chefUid: chefUid, chefUsername: chefUsername, timestamp: Date.now() });
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'followers'), { chefUid: chefUid, followerUid: user.uid, followerUsername: profile.username || "anonymous", timestamp: Date.now() });
        addToast(`Following @${chefUsername}`, "success");
      }
    } catch (e) { addToast("Failed to complete follow action", "error"); }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setActiveTab("login");
      addToast("Logged out successfully!", "info");
    } catch (e) { addToast("Failed to logout cleanly", "error"); }
  };

  const myCreatedRecipes = useMemo(() => {
    return recipes.filter(r => r.createdByUid === user?.uid);
  }, [recipes, user]);

  const totalLikesReceived = useMemo(() => {
    return myCreatedRecipes.reduce((acc, curr) => acc + (curr.likes?.length || 0), 0);
  }, [myCreatedRecipes]);

  const followCounts = useMemo(() => {
    const followingCount = following.filter(f => f.followerUid === user?.uid).length;
    const followersCount = followers.filter(f => f.chefUid === user?.uid).length;
    return { followersCount, followingCount };
  }, [followers, following, user]);

  if (!authInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center space-y-4">
          <Flame className="w-12 h-12 text-rose-500 animate-pulse" />
          <p className="font-bold text-slate-500">Warming up the kitchen...</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // DEDICATED LOGIN PAGE
  // ==========================================
  if (activeTab === "login") {
    return (
      <div className={`min-h-screen font-sans flex items-center justify-center p-4 md:p-8 ${darkMode ? 'bg-slate-950 text-slate-100 dark' : 'bg-slate-50 text-slate-800'}`}>
        <div className="fixed top-5 right-5 z-50 space-y-2 pointer-events-none">
          {toasts.map(t => (
            <div key={t.id} className={`p-4 rounded-xl shadow-xl border flex items-center space-x-2 transition-all duration-300 ${
              t.type === 'error' ? 'bg-rose-500 text-white border-rose-600' :
              t.type === 'info' ? 'bg-amber-500 text-white border-amber-600' :
              'bg-emerald-600 text-white border-emerald-700'
            } pointer-events-auto max-w-sm`}>
              {t.type === 'error' ? <Info className="w-5 h-5 mr-1" /> : <Check className="w-5 h-5 mr-1" />}
              <span className="text-sm font-semibold">{t.message}</span>
            </div>
          ))}
        </div>

        <div className="max-w-5xl w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col md:flex-row min-h-[600px] relative animate-fadeIn">
          <button 
            onClick={() => setDarkMode(!darkMode)} 
            className="absolute top-4 left-4 p-2 rounded-xl text-white/80 hover:text-white md:bg-black/20 z-10 transition-colors"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <div className="md:w-5/12 bg-gradient-to-br from-amber-500 to-rose-600 p-10 flex flex-col justify-between text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-rose-900/20 rounded-full blur-3xl"></div>

            <div className="relative z-10">
              <div className="flex items-center space-x-3 mb-12">
                <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-sm">
                  <Flame className="w-8 h-8 text-white animate-pulse" />
                </div>
                <span className="font-black text-xl tracking-widest">ARBEEZ CHEF</span>
              </div>
              <h2 className="text-4xl font-black leading-tight mb-4">The Future of <br/> Culinary Creation.</h2>
              <p className="text-sm text-white/80 leading-relaxed max-w-sm">Join a premium community of chefs. Generate recipes with AI, manage your custom cookbooks, and share flavors globally.</p>
            </div>
            
            <div className="relative z-10 space-y-4">
              <div className="flex items-center space-x-3 bg-white/10 p-3 rounded-2xl backdrop-blur-sm border border-white/20">
                <Cpu className="w-6 h-6 text-amber-200" />
                <span className="text-sm font-semibold">Gemini AI Recipe Generation</span>
              </div>
              <div className="flex items-center space-x-3 bg-white/10 p-3 rounded-2xl backdrop-blur-sm border border-white/20">
                <Heart className="w-6 h-6 text-rose-200" />
                <span className="text-sm font-semibold">Interactive Community Feed</span>
              </div>
            </div>
          </div>

          <div className="md:w-7/12 p-8 md:p-12 flex flex-col justify-center">
            <AuthForm 
              onClose={() => {}} 
              addToast={addToast} 
              db={db} 
              appId={appId} 
              auth={auth} 
              onGuestLogin={async () => {
                try {
                  await signInAnonymously(auth);
                  setActiveTab("dashboard");
                  addToast("Entered Guest Mode. Some features will be limited.", "info");
                } catch (e) {
                  addToast("Failed to enter guest mode.", "error");
                }
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // MAIN APPLICATION LAYOUT
  // ==========================================
  return (
    <div className={`min-h-screen font-sans ${darkMode ? 'bg-slate-950 text-slate-100 dark' : 'bg-slate-50 text-slate-800'}`}>
      
      <div className="fixed top-5 right-5 z-50 space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`p-4 rounded-xl shadow-xl border flex items-center space-x-2 transition-all duration-300 transform translate-y-0 ${
            t.type === 'error' ? 'bg-rose-500 text-white border-rose-600' :
            t.type === 'info' ? 'bg-amber-500 text-white border-amber-600' :
            'bg-emerald-600 text-white border-emerald-700'
          } pointer-events-auto max-w-sm`}>
            {t.type === 'error' ? <Info className="w-5 h-5 mr-1" /> : <Check className="w-5 h-5 mr-1" />}
            <span className="text-sm font-semibold">{t.message}</span>
          </div>
        ))}
      </div>

      <div className="flex min-h-screen">
        
        {/* SIDEBAR NAVIGATION - DESKTOP */}
        <aside className={`shrink-0 transition-all duration-300 border-r border-slate-200 dark:border-slate-800 ${
          isSidebarOpen ? 'w-64' : 'w-20'
        } hidden md:flex flex-col bg-white dark:bg-slate-900 justify-between sticky top-0 h-screen`}>
          <div>
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center space-x-3">
              <div className="bg-gradient-to-tr from-amber-500 to-rose-500 p-2.5 rounded-xl text-white shadow-md shadow-amber-500/20">
                <Flame className="w-6 h-6 animate-pulse" />
              </div>
              {isSidebarOpen && (
                <div className="flex flex-col">
                  <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-amber-500 via-rose-500 to-orange-600 bg-clip-text text-transparent">ARBEEZ CHEF</span>
                  <span className="text-xs font-semibold text-slate-400">AI PLATFORM 2.0</span>
                </div>
              )}
            </div>

            <nav className="p-4 space-y-1">
              {[
                { id: "dashboard", label: "Command Center", icon: BookOpen },
                { id: "discover", label: "Discover Cuisine", icon: Compass },
                { id: "generate", label: "AI Generator", icon: Cpu, badge: "PRO", requiresAuth: true },
                { id: "chef-ai", label: "Chef AI Chat", icon: MessageSquare },
                { id: "upload", label: "Recipe Creator", icon: PlusCircle, requiresAuth: true },
                { id: "favorites", label: "My Cookbooks", icon: Heart, requiresAuth: true },
                { id: "meal-planner", label: "Weekly Planner", icon: Calendar, requiresAuth: true },
                { id: "shopping-list", label: "Shopping List", icon: ShoppingBag, requiresAuth: true },
                { id: "profile", label: "Chef Profile", icon: User }, // Note: no requiresAuth! 
              ].map(item => {
                const IconComp = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.requiresAuth && isAnonymous) {
                        addToast(`Please authenticate to access ${item.label}!`, "info");
                        setActiveTab("login");
                        return;
                      }
                      setActiveTab(item.id);
                      setSelectedRecipeDetail(null);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all font-medium text-sm group ${
                      isActive 
                        ? 'bg-gradient-to-r from-amber-500/10 to-rose-500/10 text-rose-500 border-l-4 border-rose-500' 
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <IconComp className={`w-5 h-5 transition-transform group-hover:scale-105 ${isActive ? 'text-rose-500' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-100'}`} />
                      {isSidebarOpen && <span>{item.label}</span>}
                    </div>
                    {isSidebarOpen && item.badge && (
                      <span className="bg-rose-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-md tracking-wider">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            {isSidebarOpen && (
              <div className="flex items-center space-x-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl relative group">
                <Avatar name={profile.name} size="w-10 h-10" textClass="text-sm" />
                <div className="overflow-hidden flex-1">
                  <p className="font-bold text-xs truncate">{profile.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">@{profile.username}</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-1 text-slate-400 hover:text-rose-500 rounded-lg"
                  title={isAnonymous ? "Sign In" : "Sign Out"}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <button 
                onClick={() => setDarkMode(!darkMode)} 
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {darkMode ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-slate-600" />}
              </button>
              {isSidebarOpen && (
                <button 
                  onClick={() => {
                    if (isAnonymous) {
                      addToast("Please sign in to update account settings", "info");
                      setActiveTab("login");
                      return;
                    }
                    setActiveTab("settings");
                  }} 
                  className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <Settings className="w-4 h-4" />
                  <span>Settings</span>
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* MAIN BODY AREA */}
        <main className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0">
          <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
                className="hidden md:block p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <ChevronRight className={`w-5 h-5 transition-transform ${isSidebarOpen ? 'rotate-180' : ''}`} />
              </button>

              <div className="flex items-center space-x-2 md:hidden">
                <Flame className="w-5 h-5 text-rose-500" />
                <span className="font-black text-sm tracking-wide text-rose-500">ARBEEZ CHEF</span>
              </div>

              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white capitalize">
                  {activeTab.replace('-', ' ')}
                </h1>
                <p className="text-xs text-slate-400 hidden sm:block">
                  {isAnonymous ? "Operating in Guest Mode" : `Logged in as ${profile.name}`}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {isAnonymous ? (
                <button 
                  onClick={() => setActiveTab("login")}
                  className="bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-1.5 hover:bg-amber-500/20 transition-colors"
                >
                  <Lock className="w-3 h-3" />
                  <span>Guest Mode (Sign In)</span>
                </button>
              ) : (
                <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-1.5">
                  <Award className="w-3.5 h-3.5" />
                  <span>Verified Chef</span>
                </div>
              )}
            </div>
          </header>

          <section className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8">
            
            {selectedRecipeDetail && (
              <RecipeDetailView 
                recipe={selectedRecipeDetail} 
                onBack={() => setSelectedRecipeDetail(null)}
                profile={profile}
                user={user}
                onLike={() => handleLikeRecipe(selectedRecipeDetail.id)}
                onFavorite={() => handleToggleFavorite(selectedRecipeDetail)}
                isFavorite={favorites.some(f => f.recipeId === selectedRecipeDetail.id)}
                onFollow={(uid, uname) => handleFollowChef(uid, uname)}
                followingList={following}
                addToast={addToast}
                isAnonymous={isAnonymous}
              />
            )}

            {!selectedRecipeDetail && (
              <>
                {activeTab === "dashboard" && (
                  <DashboardView 
                    recipes={recipes}
                    myRecipes={myCreatedRecipes}
                    totalLikes={totalLikesReceived}
                    followCounts={followCounts}
                    favorites={favorites}
                    onNavigate={(tab) => {
                      const requiresAuth = ["generate", "upload", "favorites", "meal-planner", "shopping-list"].includes(tab);
                      if (requiresAuth && isAnonymous) {
                        addToast("Please sign in or register to use that feature!", "info");
                        setActiveTab("login");
                        return;
                      }
                      setActiveTab(tab);
                    }}
                    onSelectRecipe={(rec) => setSelectedRecipeDetail(rec)}
                    onLikeRecipe={(id) => handleLikeRecipe(id)}
                    user={user}
                    isAnonymous={isAnonymous}
                  />
                )}

                {activeTab === "discover" && (
                  <DiscoverView 
                    recipes={recipes} 
                    onSelectRecipe={(rec) => setSelectedRecipeDetail(rec)}
                    onLikeRecipe={(id) => handleLikeRecipe(id)}
                    favorites={favorites}
                    onFavorite={(rec) => handleToggleFavorite(rec)}
                    onChefSelect={(username) => {
                      setSelectedChefUsername(username);
                      setActiveTab("chef-profile");
                    }}
                    isAnonymous={isAnonymous}
                  />
                )}

                {activeTab === "generate" && !isAnonymous && (
                  <AiRecipeGeneratorView 
                    addToast={addToast} 
                    user={user} 
                    onRecipeCreated={(newRec) => {
                      setRecipes(prev => [newRec, ...prev]);
                      setSelectedRecipeDetail(newRec);
                    }}
                  />
                )}

                {activeTab === "chef-ai" && <AiChefChatView />}

                {activeTab === "upload" && !isAnonymous && (
                  <UploadRecipeView 
                    user={user} 
                    profile={profile} 
                    addToast={addToast}
                    onSuccess={(newRec) => {
                      setSelectedRecipeDetail(newRec);
                    }}
                  />
                )}

                {activeTab === "favorites" && !isAnonymous && (
                  <FavoritesView 
                    favorites={favorites} 
                    recipes={recipes}
                    onSelectRecipe={(rec) => setSelectedRecipeDetail(rec)}
                    onRemoveFavorite={(rec) => handleToggleFavorite(rec)}
                  />
                )}

                {activeTab === "meal-planner" && !isAnonymous && (
                  <MealPlannerView 
                    recipes={recipes}
                    mealPlan={mealPlan}
                    user={user}
                    addToast={addToast}
                  />
                )}

                {activeTab === "shopping-list" && !isAnonymous && (
                  <ShoppingListView 
                    shoppingList={shoppingList}
                    user={user}
                    addToast={addToast}
                  />
                )}

                {/* Profile View (Accessible to both Guests and Authenticated) */}
                {activeTab === "profile" && (
                  <ChefProfileView 
                    profile={profile} 
                    myRecipes={myCreatedRecipes} 
                    followersCount={followCounts.followersCount} 
                    followingCount={followCounts.followingCount}
                    totalLikes={totalLikesReceived}
                    onSelectRecipe={(rec) => setSelectedRecipeDetail(rec)}
                    isAnonymous={isAnonymous}
                    onLoginClick={() => setActiveTab("login")}
                  />
                )}

                {activeTab === "chef-profile" && (
                  <PublicChefProfileView 
                    selectedUsername={selectedChefUsername} 
                    recipes={recipes} 
                    user={user} 
                    following={following}
                    followers={followers}
                    onFollowChef={(uid, uname) => handleFollowChef(uid, uname)}
                    onBack={() => setActiveTab("discover")}
                    onSelectRecipe={(rec) => setSelectedRecipeDetail(rec)}
                    isAnonymous={isAnonymous}
                  />
                )}

                {activeTab === "settings" && !isAnonymous && (
                  <SettingsView 
                    profile={profile} 
                    setProfile={setProfile} 
                    darkMode={darkMode} 
                    setDarkMode={setDarkMode}
                    addToast={addToast}
                    user={user}
                  />
                )}
              </>
            )}

          </section>

          {/* MOBILE BOTTOM NAVIGATION */}
          <nav className="md:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 fixed bottom-0 left-0 right-0 py-3 px-6 flex justify-between items-center z-40 shadow-xl">
            {[
              { id: "dashboard", label: "Home", icon: BookOpen },
              { id: "discover", label: "Discover", icon: Compass },
              { id: "generate", label: "AI Chef", icon: Cpu, requiresAuth: true },
              { id: "favorites", label: "Favorites", icon: Heart, requiresAuth: true },
              { id: "profile", label: "Profile", icon: User } // No requiresAuth restriction here
            ].map(item => {
              const IconComp = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.requiresAuth && isAnonymous) {
                      addToast("Please sign in to access premium features!", "info");
                      setActiveTab("login");
                      return;
                    }
                    setActiveTab(item.id);
                    setSelectedRecipeDetail(null);
                  }}
                  className={`flex flex-col items-center space-y-1 ${isActive ? 'text-rose-500' : 'text-slate-400'}`}
                >
                  <IconComp className="w-5 h-5" />
                  <span className="text-[10px] font-semibold">{item.label}</span>
                </button>
              );
            })}
          </nav>

        </main>
      </div>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: AUTHENTICATION FORM FOR LOGIN PAGE
// =========================================================================
function AuthForm({ onClose, addToast, db, appId, auth, onGuestLogin }) {
  const [view, setView] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordStrength = useMemo(() => {
    if (!password) return { label: "None", color: "bg-slate-200 dark:bg-slate-700", percent: 0 };
    if (password.length < 6) return { label: "Weak", color: "bg-rose-500", percent: 30 };
    if (password.length < 10) return { label: "Moderate", color: "bg-amber-500", percent: 65 };
    return { label: "Strong Chef Password", color: "bg-emerald-500", percent: 100 };
  }, [password]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (view === "login") {
        await signInWithEmailAndPassword(auth, email, password);
        addToast("Welcome back to your kitchen dashboard!", "success");
      } else if (view === "register") {
        if (password !== confirmPassword) {
          addToast("Passwords do not match!", "error");
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          addToast("Password should be at least 6 characters.", "error");
          setLoading(false);
          return;
        }

        const cred = await createUserWithEmailAndPassword(auth, email, password);
        
        // Save initial profile details in Firestore
        const profileDocRef = doc(db, 'artifacts', appId, 'users', cred.user.uid, 'profile', 'info');
        const customProfile = {
          uid: cred.user.uid,
          name: fullName || "Gourmet Specialist",
          username: username.toLowerCase().replace(/\s+/g, '_') || `chef_${cred.user.uid.substring(0, 5)}`,
          bio: "Artisan Chef ready to curate original dishes.",
          coverGradient: recipeGradients[Math.floor(Math.random() * recipeGradients.length)],
          favoriteCuisines: ["Italian", "French"],
          dietaryPreferences: ["None"],
          allergies: [],
          joinedDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
        };
        await setDoc(profileDocRef, customProfile);

        addToast("Chef account successfully registered!", "success");
      } else if (view === "forgot") {
        addToast("If registered, a recovery link has been simulated.", "info");
        setView("login");
      }
    } catch (err) {
      addToast(err.message || "Authentication error encountered.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <span className="text-[10px] font-extrabold text-rose-500 uppercase tracking-widest">Arbeez Secure Entry</span>
        <h4 className="text-3xl font-bold tracking-tight mt-1 text-slate-900 dark:text-white">
          {view === "login" ? "Sign In to Your Kitchen" : view === "register" ? "Create Chef Account" : "Recover Access"}
        </h4>
        <p className="text-sm text-slate-400 mt-2">Join the premium community to save your personal cookbooks and share recipes globally.</p>
      </div>

      <form onSubmit={handleAuthSubmit} className="space-y-4">
        {view === "register" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Full Name</label>
              <input 
                type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Gordon Ramsay"
                className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 focus:outline-none focus:border-rose-500" required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Username</label>
              <input 
                type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="gordon_r"
                className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 focus:outline-none focus:border-rose-500" required
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase">Email Address</label>
          <div className="relative">
            <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="chef@arbeez.com"
              className="w-full pl-10 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 focus:outline-none focus:border-rose-500" required
            />
          </div>
        </div>

        {view !== "forgot" && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Password</label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                className="w-full pl-10 pr-10 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 focus:outline-none focus:border-rose-500" required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {view === "register" && (
          <>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Confirm Password</label>
              <input 
                type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••"
                className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 focus:outline-none focus:border-rose-500" required
              />
            </div>
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase">
                <span className="text-slate-400">Security Strength</span>
                <span className={passwordStrength.color.split(" ")[0].replace("bg-", "text-")}>{passwordStrength.label}</span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-300 ${passwordStrength.color}`} style={{ width: `${passwordStrength.percent}%` }}></div>
              </div>
            </div>
          </>
        )}

        {view === "login" && (
          <div className="text-right">
            <button type="button" onClick={() => setView("forgot")} className="text-xs font-bold text-slate-500 hover:text-rose-500 transition-colors">
              Forgot Password?
            </button>
          </div>
        )}

        <div className="pt-2">
          <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-amber-500 to-rose-500 text-white font-bold py-3.5 rounded-xl shadow-lg text-sm hover:shadow-xl transition-all">
            {loading ? "Processing..." : view === "login" ? "Secure Sign In" : view === "register" ? "Create Chef Account" : "Send Recovery Link"}
          </button>
        </div>
      </form>

      <div className="flex items-center space-x-4 my-6">
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">OR</span>
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
      </div>

      <button onClick={onGuestLogin} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold py-3.5 rounded-xl shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center justify-center space-x-2">
        <UserCheck className="w-4 h-4" />
        <span>Continue as Guest</span>
      </button>

      <div className="pt-4 text-center text-sm">
        {view === "login" ? (
          <p className="text-slate-500">
            Don't have an artisan account?{" "}
            <button onClick={() => setView("register")} className="text-rose-500 font-bold hover:underline">Sign Up Here</button>
          </p>
        ) : (
          <p className="text-slate-500">
            Already have a profile?{" "}
            <button onClick={() => setView("login")} className="text-rose-500 font-bold hover:underline">Login Instead</button>
          </p>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: DASHBOARD VIEW
// =========================================================================
function DashboardView({ recipes, myRecipes, totalLikes, followCounts, favorites, onNavigate, onSelectRecipe, onLikeRecipe, user, isAnonymous }) {
  const trendingRecipes = useMemo(() => {
    return [...recipes].sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0)).slice(0, 3);
  }, [recipes]);

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-slate-900 to-amber-950 text-white p-8 md:p-12 shadow-2xl">
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 bg-cover bg-center hidden md:block" style={{ backgroundImage: `url('data:image/svg+xml;utf8,<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" stroke="white" stroke-width="2" fill="none"/></svg>')` }}></div>
        <div className="relative z-10 max-w-xl space-y-4">
          <span className="bg-amber-500/20 text-amber-300 font-extrabold text-xs tracking-wider px-3 py-1 rounded-full border border-amber-500/20">PREMIUM AI EXPERTISE</span>
          <h2 className="text-3xl md:text-5xl font-black leading-tight tracking-tight">Create Extraordinary Culinary Masterpieces.</h2>
          <p className="text-slate-300 text-sm md:text-base">Harness the power of Arbeez Chef AI to draft customized recipes, extract grocery indexes, track instant nutrients, and share gourmet craft with friends.</p>
          <div className="pt-2 flex flex-wrap gap-3">
            <button onClick={() => onNavigate("generate")} className="bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white font-bold text-sm px-6 py-3 rounded-xl shadow-lg shadow-rose-500/20 transition-transform active:scale-95 flex items-center space-x-2">
              <Cpu className="w-4 h-4" /><span>Launch AI Kitchen</span>
            </button>
            <button onClick={() => onNavigate("upload")} className="bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm px-5 py-3 rounded-xl transition-all">
              Upload Recipe Draft
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Followers", value: isAnonymous ? 0 : followCounts.followersCount, color: "from-purple-500 to-indigo-500" },
          { label: "Following", value: isAnonymous ? 0 : followCounts.followingCount, color: "from-blue-500 to-teal-500" },
          { label: "Recipes Published", value: isAnonymous ? 0 : myRecipes.length, color: "from-amber-500 to-orange-500" },
          { label: "Hearts Received", value: isAnonymous ? 0 : totalLikes, color: "from-rose-500 to-pink-500" }
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{stat.label}</span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className={`text-3xl font-extrabold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>{stat.value}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-2xl p-6 border border-indigo-500/10 flex flex-col justify-between space-y-4">
          <div>
            <div className="p-3 bg-indigo-500/10 text-indigo-500 w-fit rounded-xl"><MessageSquare className="w-6 h-6" /></div>
            <h3 className="font-bold text-lg mt-3">Interactive Chef AI Chat</h3>
            <p className="text-xs text-slate-400 mt-1">Ask questions regarding ingredient substitution, nutrition parameters, or standard kitchen fixes.</p>
          </div>
          <button onClick={() => onNavigate("chef-ai")} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl font-semibold text-xs text-indigo-600 dark:text-indigo-400">Consult AI Chef Now</button>
        </div>

        <div className="bg-gradient-to-br from-teal-500/5 to-emerald-500/5 rounded-2xl p-6 border border-teal-500/10 flex flex-col justify-between space-y-4">
          <div>
            <div className="p-3 bg-teal-500/10 text-teal-500 w-fit rounded-xl"><Calendar className="w-6 h-6" /></div>
            <h3 className="font-bold text-lg mt-3">Curate Weekly Meal Plan</h3>
            <p className="text-xs text-slate-400 mt-1">Map out breakfast, lunch, and dinner. Convert automatically to smart grocery index.</p>
          </div>
          <button onClick={() => onNavigate("meal-planner")} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl font-semibold text-xs text-teal-600 dark:text-teal-400">Open Meal Planner</button>
        </div>

        <div className="bg-gradient-to-br from-rose-500/5 to-amber-500/5 rounded-2xl p-6 border border-rose-500/10 flex flex-col justify-between space-y-4">
          <div>
            <div className="p-3 bg-rose-500/10 text-rose-500 w-fit rounded-xl"><Heart className="w-6 h-6" /></div>
            <h3 className="font-bold text-lg mt-3">My Gourmet Cookbooks</h3>
            <p className="text-xs text-slate-400 mt-1">Quick access to curated, hand-chosen favorites, and culinary recipes generated by AI.</p>
          </div>
          <button onClick={() => onNavigate("favorites")} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl font-semibold text-xs text-rose-600 dark:text-rose-400">Browse Favorites ({favorites.length})</button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold tracking-tight">Trending Community Masterpieces</h3>
          <button onClick={() => onNavigate("discover")} className="text-xs text-rose-500 font-semibold hover:underline">View All Discoveries</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {trendingRecipes.length === 0 ? (
            <div className="col-span-3 text-center py-12 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <p className="text-sm text-slate-400 font-medium">No recipes currently uploaded in the public pool. Spark the discovery by generating one!</p>
            </div>
          ) : (
            trendingRecipes.map(recipe => (
              <RecipeCard key={recipe.id} recipe={recipe} onSelect={onSelectRecipe} onLike={() => {}} liked={recipe.likes?.includes(user?.uid)} isAnonymous={isAnonymous} onLikeDirect={onLikeRecipe} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: RECIPE CARD
// =========================================================================
function RecipeCard({ recipe, onSelect, onLike, liked, isAnonymous, onLikeDirect }) {
  const renderCover = () => {
    const isUrl = recipe.cover?.startsWith('http');
    if (isUrl) return <img src={recipe.cover} alt={recipe.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />;
    return <div className="w-full h-full transition-transform duration-500 group-hover:scale-105"><CoverPlaceholder gradientClass={recipe.cover} /></div>;
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all group flex flex-col justify-between">
      <div>
        <div className="relative h-48 overflow-hidden bg-slate-100 dark:bg-slate-800">
          {renderCover()}
          <span className="absolute top-3 left-3 bg-white/90 dark:bg-slate-950/95 backdrop-blur-md text-xs font-bold px-3 py-1 rounded-full shadow text-amber-500 dark:text-amber-400">
            {recipe.cuisine || "Global"}
          </span>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if (isAnonymous) onLike("login"); 
              else onLikeDirect(recipe.id);
            }}
            className={`absolute top-3 right-3 p-2 rounded-full backdrop-blur-md border shadow transition-colors ${
              liked ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white/95 text-slate-600 hover:text-rose-500 border-slate-200 dark:bg-slate-950/95 dark:border-slate-800'
            }`}
          >
            <Heart className="w-4 h-4" fill={liked ? "currentColor" : "none"} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center space-x-2">
            <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 text-[10px] font-extrabold px-2 py-0.5 rounded tracking-wide uppercase">{recipe.difficulty || "Easy"}</span>
            <span className="text-xs text-slate-400 flex items-center"><Clock className="w-3.5 h-3.5 mr-1 text-slate-400" />{recipe.cookTime || recipe.totalTime || "25 mins"}</span>
          </div>
          <h4 className="font-extrabold text-lg text-slate-950 dark:text-white line-clamp-1 leading-snug">{recipe.name}</h4>
          <p className="text-xs text-slate-400 line-clamp-2">{recipe.description || "Indulge in this gourmet experience prepared to perfection with rich flavors and wholesome goodness."}</p>
        </div>
      </div>
      <div className="px-5 pb-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Avatar name={recipe.createdByChef || "AI"} size="w-6 h-6" textClass="text-[8px]" />
          <span className="text-[11px] font-semibold text-slate-500 truncate max-w-[120px]">{recipe.createdByChef || "Arbeez AI Chef"}</span>
        </div>
        <button onClick={() => onSelect(recipe)} className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors flex items-center space-x-1">
          <span>View Details</span><ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: AI RECIPE GENERATOR VIEW
// =========================================================================
function AiRecipeGeneratorView({ addToast, user, onRecipeCreated }) {
  const [ingredients, setIngredients] = useState("");
  const [cuisine, setCuisine] = useState("Italian");
  const [cookingTime, setCookingTime] = useState("30");
  const [servings, setServings] = useState("4");
  const [difficulty, setDifficulty] = useState("Medium");
  const [diet, setDiet] = useState("None");
  const [loading, setLoading] = useState(false);

  const handleGenerateRecipe = async () => {
    if (!ingredients.trim()) { addToast("Please provide at least one ingredient to start standard AI generation.", "error"); return; }
    setLoading(true);
    addToast("Chef AI is conceptualizing your master recipe...", "info");

    const systemPrompt = "You are a professional chef and nutritional scientist. You only output structured, parsed recipes. Return response in a precise JSON schema format, nothing else, no markdown wrapper words like ```json.";
    const userPrompt = `Create a delicious recipe with ingredients: [${ingredients}]. Cuisine: [${cuisine}]. Time: [${cookingTime} mins]. Servings: [${servings}]. Difficulty: [${difficulty}]. Diet: [${diet}].
      You MUST respond ONLY with a valid JSON object matching this exact structure: { "name": "...", "cuisine": "...", "difficulty": "...", "totalTime": "...", "description": "...", "servings": "...", "ingredients": [{"name": "...", "amount": "...", "unit": "..."}], "instructions": [{"step": 1, "title": "...", "description": "..."}], "nutrition": {"calories": "...", "protein": "...", "carbohydrates": "...", "fat": "...", "fiber": "..."}, "tips": ["..."] }`;

    try {
      const responseText = await callGemini(userPrompt, systemPrompt);
      const cleanJson = responseText.replace(/```json|```/g, "").trim();
      const parsedRecipe = JSON.parse(cleanJson);
      const randomGradient = recipeGradients[Math.floor(Math.random() * recipeGradients.length)];
      const recDoc = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'recipes'), {
        ...parsedRecipe, createdByUid: user?.uid || "system", createdByChef: "Arbeez AI Chef", cover: randomGradient, likes: [], commentsCount: 0, createdAt: Date.now()
      });
      addToast("Gourmet master recipe compiled and analyzed!", "success");
      onRecipeCreated({ id: recDoc.id, ...parsedRecipe });
    } catch (e) {
      addToast("Failed to compile AI recipe. Attempting structured fallback generation...", "error");
      const randomGradient = recipeGradients[Math.floor(Math.random() * recipeGradients.length)];
      const fallbackRecipe = {
        id: "fallback-" + Date.now(), name: `${cuisine} Style Inspired Fusion Surprise`, cuisine: cuisine, difficulty: difficulty, totalTime: `${cookingTime} mins`, description: "An elegant, prompt-aligned culinary masterpiece designed dynamically with available kitchen goods.", servings: `${servings} persons`, ingredients: [{ name: "Selected Ingredients", amount: "1", unit: "unit" }, { name: "Extra Virgin Olive Oil", amount: "2", unit: "tablespoons" }], instructions: [{ step: 1, title: "Prepare Kitchen Station", description: "Clean, chop, and sequence all core ingredients in order of heat endurance." }], nutrition: { calories: "340 kcal", protein: "18g", carbohydrates: "24g", fat: "14g", fiber: "4g" }, tips: ["Pair with matching local dynamic wine or sparkling cider."], createdByUid: user?.uid || "system", createdByChef: "Arbeez AI Chef", cover: randomGradient, likes: []
      };
      try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'recipes'), fallbackRecipe);
        onRecipeCreated(fallbackRecipe);
      } catch (err) {}
    } finally { setLoading(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fadeIn">
      <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div><h3 className="text-lg font-bold">Chef AI Crafting Console</h3><p className="text-xs text-slate-400">Set culinary guidelines for instant creation</p></div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Available Ingredients (Comma separated)</label>
          <textarea rows="3" value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="e.g. Tomato, Salmon, Mushroom" className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-amber-500"></textarea>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Cuisine</label><select value={cuisine} onChange={(e) => setCuisine(e.target.value)} className="w-full text-sm bg-slate-50 dark:bg-slate-800 border rounded-xl p-2.5">{["Italian", "Indian", "Chinese", "Mexican", "Arabic", "Gourmet French", "American Comfort"].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="space-y-1.5"><label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Diet Type</label><select value={diet} onChange={(e) => setDiet(e.target.value)} className="w-full text-sm bg-slate-50 dark:bg-slate-800 border rounded-xl p-2.5">{["None", "Keto", "Vegan", "Vegetarian", "Gluten-Free", "Low-Carb"].map(d => <option key={d} value={d}>{d}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Max Time (Mins)</label><input type="number" value={cookingTime} onChange={(e) => setCookingTime(e.target.value)} className="w-full text-sm bg-slate-50 dark:bg-slate-800 border rounded-xl p-2.5" /></div>
          <div className="space-y-1.5"><label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Servings</label><input type="number" value={servings} onChange={(e) => setServings(e.target.value)} className="w-full text-sm bg-slate-50 dark:bg-slate-800 border rounded-xl p-2.5" /></div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide font-semibold">Skill Level Requirement</label>
          <div className="grid grid-cols-3 gap-2">
            {["Easy", "Medium", "Hard"].map(level => (
              <button key={level} onClick={() => setDifficulty(level)} className={`py-2 text-xs font-bold rounded-lg border transition-all ${difficulty === level ? 'bg-amber-500 border-amber-500 text-white' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>{level}</button>
            ))}
          </div>
        </div>
        <button onClick={handleGenerateRecipe} disabled={loading} className="w-full bg-gradient-to-r from-amber-500 to-rose-500 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center space-x-2">
          {loading ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>Formulating with AI...</span></> : <><Sparkles className="w-5 h-5 text-white animate-bounce" /><span>Generate Premium Recipe</span></>}
        </button>
      </div>

      <div className="lg:col-span-7 space-y-6">
        <div className="bg-slate-100 dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 text-center flex flex-col justify-center items-center h-full min-h-[400px]">
          <div className="bg-gradient-to-tr from-amber-500 to-rose-500 p-6 rounded-2xl text-white shadow-xl shadow-amber-500/10 mb-4"><Cpu className="w-12 h-12" /></div>
          <h4 className="font-extrabold text-xl">Arbeez Creative Culinary Engine</h4>
          <p className="text-slate-400 text-sm max-w-sm mt-2">Fill out the parameters on the left and see AI dynamically write preparation instructions, calculated macro nutritional statistics, and chef secret tricks.</p>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: DISCOVER VIEW
// =========================================================================
function DiscoverView({ recipes, onSelectRecipe, onLikeRecipe, favorites, onFavorite, onChefSelect, isAnonymous }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCuisine, setSelectedCuisine] = useState("All");
  const cuisines = ["All", "Indian", "Italian", "Chinese", "Mexican", "Arabic"];

  const filteredRecipes = useMemo(() => {
    return recipes.filter(rec => {
      const matchesSearch = rec.name?.toLowerCase().includes(searchTerm.toLowerCase()) || rec.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCuisine = selectedCuisine === "All" || rec.cuisine === selectedCuisine;
      return matchesSearch && matchesCuisine;
    });
  }, [recipes, searchTerm, selectedCuisine]);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search recipes, ingredients, culinary styles..." className="w-full pl-11 pr-4 py-3 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500" />
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <span className="text-xs font-bold text-slate-400 uppercase mr-1">Cuisine:</span>
          <div className="flex flex-wrap gap-1">
            {cuisines.map(c => <button key={c} onClick={() => setSelectedCuisine(c)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${selectedCuisine === c ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'}`}>{c}</button>)}
          </div>
        </div>
      </div>
      {filteredRecipes.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <Info className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h4 className="font-extrabold text-lg">No Recipes Match Your Filters</h4>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecipes.map(recipe => (
            <RecipeCard key={recipe.id} recipe={recipe} onSelect={onSelectRecipe} onLike={onChefSelect} liked={recipe.likes?.includes(user?.uid)} isAnonymous={isAnonymous} onLikeDirect={onLikeRecipe} />
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: AI CHEF CHAT VIEW
// =========================================================================
function AiChefChatView() {
  const [messages, setMessages] = useState([{ id: 1, sender: "assistant", text: "Hello! I am your AI Chef Assistant. Need premium swaps or instant food alternative guides? Let's discuss culinary arts." }]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    const userMsg = { id: Date.now(), sender: "user", text: inputMessage };
    setMessages(prev => [...prev, userMsg]);
    const userQuery = inputMessage;
    setInputMessage("");
    setIsTyping(true);

    try {
      const reply = await callGemini(userQuery, "You are a World-Class Executive Chef and Culinary Master. Provide actionable cooking advice. Use Markdown format.");
      setMessages(prev => [...prev, { id: Date.now() + 1, sender: "assistant", text: reply }]);
    } catch (err) { setMessages(prev => [...prev, { id: Date.now() + 1, sender: "assistant", text: "I ran into a temporary kitchen storage error." }]); } finally { setIsTyping(false); }
  };

  return (
    <div className="max-w-4xl mx-auto h-[600px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col justify-between overflow-hidden shadow-xl animate-fadeIn">
      <div className="p-4 bg-gradient-to-r from-amber-500/10 to-rose-500/10 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3"><div className="w-10 h-10 bg-gradient-to-tr from-amber-500 to-rose-500 text-white flex items-center justify-center rounded-xl font-bold"><Cpu className="w-5 h-5" /></div><div><h4 className="font-bold text-sm">Gourmet Chef Assistant</h4><span className="text-[10px] text-emerald-500 font-bold flex items-center"><span className="w-2 h-2 bg-emerald-500 rounded-full mr-1.5 animate-pulse"></span> Gemini Powered</span></div></div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`p-4 rounded-2xl max-w-md text-sm leading-relaxed ${msg.sender === 'user' ? 'bg-rose-500 text-white rounded-tr-none' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none'}`}>
              <p className="font-semibold text-xs mb-1 opacity-70">{msg.sender === 'user' ? 'You' : 'Arbeez Chef AI'}</p>
              <div className="whitespace-pre-line text-xs font-medium">{msg.text}</div>
            </div>
          </div>
        ))}
        {isTyping && <div className="flex justify-start"><div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl text-slate-400 text-xs flex items-center space-x-1"><span className="w-2.5 h-2.5 bg-slate-400 rounded-full animate-bounce"></span><span className="w-2.5 h-2.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]"></span><span className="w-2.5 h-2.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]"></span></div></div>}
        <div ref={scrollRef}></div>
      </div>
      <form onSubmit={handleSendMessage} className="p-4 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-850 flex items-center space-x-3">
        <input type="text" value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} placeholder="Ask about protein swaps, vegan equivalents..." className="flex-1 py-3 px-4 text-xs bg-white dark:bg-slate-900 border rounded-xl focus:outline-none" />
        <button type="submit" className="bg-rose-500 text-white p-3 rounded-xl"><Send className="w-4 h-4" /></button>
      </form>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: RECIPE DETAIL VIEW
// =========================================================================
function RecipeDetailView({ recipe, onBack, profile, user, onLike, onFavorite, isFavorite, onFollow, followingList, addToast, isAnonymous }) {
  const [commentText, setCommentText] = useState("");
  const [localComments, setLocalComments] = useState([]);

  useEffect(() => {
    if (!recipe?.id) return;
    const commentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'recipes', recipe.id, 'comments');
    const unsub = onSnapshot(commentsRef, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => { list.push({ id: doc.id, ...doc.data() }); });
      setLocalComments(list.sort((a,b) => b.timestamp - a.timestamp));
    });
    return () => unsub();
  }, [recipe]);

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (isAnonymous) { addToast("Please register or login to comment on posts!", "info"); return; }
    if (!commentText.trim() || !user) return;
    try {
      const commentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'recipes', recipe.id, 'comments');
      await addDoc(commentsRef, { text: commentText, userId: user.uid, userName: profile.name || "Anonymous Chef", timestamp: Date.now() });
      setCommentText("");
      addToast("Comment published!", "success");
    } catch (err) { addToast("Failed to leave comment", "error"); }
  };

  const isFollowingAuthor = followingList.some(f => f.chefUid === recipe.createdByUid && f.followerUid === user?.uid);
  
  const renderCover = () => {
    const isUrl = recipe.cover?.startsWith('http');
    if (isUrl) return <img src={recipe.cover} alt={recipe.name} className="w-full h-full object-cover" />;
    return <CoverPlaceholder gradientClass={recipe.cover} />;
  };

  return (
    <div className="space-y-8 animate-fadeIn max-w-5xl mx-auto pb-12">
      <button onClick={onBack} className="flex items-center space-x-2 text-xs font-semibold text-slate-500 hover:text-rose-500">
        <ArrowLeft className="w-4 h-4" /><span>Return to Galleries</span>
      </button>

      <div className="relative h-80 md:h-[400px] rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl">
        {renderCover()}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent"></div>
        <div className="absolute bottom-6 left-6 right-6 text-white space-y-2">
          <div className="flex items-center space-x-2">
            <span className="bg-amber-500 text-white text-xs font-black px-3 py-1 rounded-full">{recipe.cuisine || "Gourmet"}</span>
            <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">{recipe.difficulty || "Medium"}</span>
          </div>
          <h2 className="text-2xl md:text-4xl font-extrabold leading-tight">{recipe.name}</h2>
          <p className="text-xs md:text-sm text-slate-300 max-w-2xl line-clamp-2">{recipe.description}</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 gap-4">
        <div className="flex items-center space-x-3">
          <Avatar name={recipe.createdByChef} size="w-10 h-10" textClass="text-sm" />
          <div>
            <p className="text-xs font-bold text-slate-400">CULINARY CREATOR</p>
            <p className="font-extrabold text-sm">{recipe.createdByChef || "Arbeez Chef AI"}</p>
          </div>
          {recipe.createdByUid && recipe.createdByUid !== user?.uid && (
            <button onClick={() => onFollow(recipe.createdByUid, recipe.createdByChef)} className={`text-xs px-3 py-1.5 rounded-lg font-bold border transition-all ${isFollowingAuthor ? 'bg-slate-100 text-slate-600 dark:bg-slate-850 dark:text-slate-300 border-transparent' : 'bg-rose-500 text-white border-rose-500 hover:bg-rose-600'}`}>
              {isFollowingAuthor ? "Following" : "Follow Chef"}
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto justify-end">
          <button onClick={onLike} className="flex items-center space-x-1.5 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 rounded-xl text-xs font-bold text-slate-600">
            <Heart className="w-4 h-4 text-rose-500" fill={recipe.likes?.includes(user?.uid) ? "currentColor" : "none"} />
            <span>({recipe.likes?.length || 0}) Likes</span>
          </button>
          <button onClick={onFavorite} className={`flex items-center space-x-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${isFavorite ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'}`}>
            <BookOpen className="w-4 h-4" />
            <span>{isFavorite ? "In My Cookbooks" : "Save Favorite"}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="border-b pb-3">
            <h3 className="font-extrabold text-lg flex items-center space-x-2"><ShoppingBag className="w-5 h-5 text-rose-500" /><span>Ingredient Index</span></h3>
            <p className="text-xs text-slate-400 mt-1">Serves: {recipe.servings || "4 persons"}</p>
          </div>
          <ul className="space-y-3">
            {recipe.ingredients?.map((ing, i) => (
              <li key={i} className="flex items-center justify-between text-xs font-medium border-b pb-2">
                <span className="text-slate-600 dark:text-slate-300">{ing.name}</span>
                <span className="text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-md">{ing.amount} {ing.unit}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-6">
            <div className="border-b pb-3"><h3 className="font-extrabold text-lg flex items-center space-x-2"><Award className="w-5 h-5 text-amber-500" /><span>Culinary Execution Steps</span></h3></div>
            <div className="space-y-6">
              {recipe.instructions?.map((inst, i) => (
                <div key={i} className="flex space-x-4">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-rose-500/10 text-rose-500 border flex items-center justify-center font-black text-sm">{i + 1}</div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">{inst.title}</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">{inst.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-6">
        <h3 className="font-extrabold text-lg">Culinary Discussions ({localComments.length})</h3>
        <form onSubmit={handlePostComment} className="flex gap-3">
          <input type="text" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Review this dish or leave feedback..." className="flex-1 text-xs py-3 px-4 bg-slate-50 dark:bg-slate-800 border rounded-xl focus:outline-none" />
          <button type="submit" className="bg-rose-500 text-white px-5 py-3 rounded-xl font-bold text-xs">Post</button>
        </form>
        <div className="space-y-4 pt-4 border-t">
          {localComments.map(com => (
            <div key={com.id} className="flex space-x-3 text-xs">
              <Avatar name={com.userName} size="w-8 h-8" textClass="text-[10px]" />
              <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">{com.userName}</span><span className="text-[10px] text-slate-400">{new Date(com.timestamp).toLocaleDateString()}</span>
                </div>
                <p className="text-slate-500 dark:text-slate-300">{com.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: RECIPE UPLOAD CREATOR VIEW
// =========================================================================
function UploadRecipeView({ user, profile, addToast, onSuccess }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cuisine, setCuisine] = useState("Italian");
  const [difficulty, setDifficulty] = useState("Medium");
  const [cookTime, setCookTime] = useState("");
  const [servings, setServings] = useState("4");
  const [cover, setCover] = useState(recipeGradients[0]);
  const [ingredients, setIngredients] = useState([{ name: "", amount: "", unit: "g" }]);
  const [instructions, setInstructions] = useState([{ step: 1, title: "", description: "" }]);

  const addIngredientField = () => setIngredients([...ingredients, { name: "", amount: "", unit: "g" }]);
  const removeIngredientField = (index) => setIngredients(ingredients.filter((_, i) => i !== index));
  const updateIngredient = (index, field, val) => { const updated = [...ingredients]; updated[index][field] = val; setIngredients(updated); };
  const addInstructionField = () => setInstructions([...instructions, { step: instructions.length + 1, title: "", description: "" }]);
  const updateInstruction = (index, field, val) => { const updated = [...instructions]; updated[index][field] = val; setInstructions(updated); };

  const handleSaveRecipe = async () => {
    if (!name.trim() || !description.trim()) { addToast("Please fill in recipe name and executive summary description.", "error"); return; }
    try {
      const payload = {
        name, description, cuisine, difficulty, cookTime: `${cookTime || '15'} mins`, servings: `${servings} persons`, cover,
        ingredients: ingredients.filter(i => i.name.trim() !== ""), instructions: instructions.filter(inst => inst.description.trim() !== ""),
        nutrition: { calories: "320", protein: "15g", carbohydrates: "35g", fat: "8g", fiber: "2g" },
        createdByUid: user?.uid || "custom", createdByChef: profile.name || "Specialist Chef", likes: [], createdAt: Date.now()
      };
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'recipes'), payload);
      addToast("Your professional recipe was successfully published!", "success");
      onSuccess({ id: docRef.id, ...payload });
    } catch (e) { addToast("Database storage error during recipe publish", "error"); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div><h3 className="text-xl font-bold">Chef Creation Studio</h3><p className="text-xs text-slate-400">Post custom culinary masterpieces to the public community</p></div>
        <div className="space-y-4">
          <div className="space-y-1.5"><label className="text-xs font-bold text-slate-400 uppercase">Recipe Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Garlic Herb Roasted Butter Salmon" className="w-full text-sm bg-slate-50 dark:bg-slate-800 border rounded-xl p-3 focus:outline-none" /></div>
          <div className="space-y-1.5"><label className="text-xs font-bold text-slate-400 uppercase">Executive Summary</label><textarea rows="3" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Provide context regarding the recipe background..." className="w-full text-sm bg-slate-50 dark:bg-slate-800 border rounded-xl p-3 focus:outline-none"></textarea></div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1.5"><label className="text-xs font-bold text-slate-400 uppercase">Cuisine Type</label><select value={cuisine} onChange={(e) => setCuisine(e.target.value)} className="w-full text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl p-3">{["Italian", "Indian", "Chinese", "Mexican", "Arabic"].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="space-y-1.5"><label className="text-xs font-bold text-slate-400 uppercase">Difficulty</label><select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl p-3">{["Easy", "Medium", "Hard"].map(d => <option key={d} value={d}>{d}</option>)}</select></div>
          <div className="space-y-1.5"><label className="text-xs font-bold text-slate-400 uppercase">Cook Time (mins)</label><input type="text" value={cookTime} onChange={(e) => setCookTime(e.target.value)} placeholder="30" className="w-full text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl p-3" /></div>
          <div className="space-y-1.5"><label className="text-xs font-bold text-slate-400 uppercase">Servings</label><input type="number" value={servings} onChange={(e) => setServings(e.target.value)} className="w-full text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl p-3" /></div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 block">Select Dynamic Gradient Cover</label>
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
            {recipeGradients.map((gradClass, idx) => (
              <button key={idx} type="button" onClick={() => setCover(gradClass)} className={`h-12 rounded-xl border-2 transition-all bg-gradient-to-br ${gradClass} ${cover === gradClass ? 'border-slate-800 shadow-md scale-105' : 'border-transparent'}`} />
            ))}
          </div>
        </div>
        <div className="space-y-4 pt-4 border-t">
          <div className="flex justify-between items-center"><label className="text-xs font-bold text-slate-400 uppercase">Ingredients List</label><button type="button" onClick={addIngredientField} className="text-xs font-bold text-rose-500 hover:underline">+ Add</button></div>
          <div className="space-y-3">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input type="text" value={ing.name} onChange={(e) => updateIngredient(idx, "name", e.target.value)} placeholder="Ingredient name" className="flex-1 text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl p-3" />
                <input type="text" value={ing.amount} onChange={(e) => updateIngredient(idx, "amount", e.target.value)} placeholder="200" className="w-20 text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl p-3 text-center" />
                <input type="text" value={ing.unit} onChange={(e) => updateIngredient(idx, "unit", e.target.value)} placeholder="g" className="w-20 text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl p-3 text-center" />
                <button type="button" onClick={() => removeIngredientField(idx)} className="p-3 text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4 pt-4 border-t">
          <div className="flex justify-between items-center"><label className="text-xs font-bold text-slate-400 uppercase">Cooking Steps</label><button type="button" onClick={addInstructionField} className="text-xs font-bold text-rose-500 hover:underline">+ Add Step</button></div>
          <div className="space-y-4">
            {instructions.map((inst, idx) => (
              <div key={idx} className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl space-y-3">
                <span className="text-xs font-black text-rose-500">Step {idx + 1}</span>
                <input type="text" value={inst.title} onChange={(e) => updateInstruction(idx, "title", e.target.value)} placeholder="Title" className="w-full text-xs bg-white dark:bg-slate-900 border rounded-xl p-2.5" />
                <textarea rows="2" value={inst.description} onChange={(e) => updateInstruction(idx, "description", e.target.value)} placeholder="Description..." className="w-full text-xs bg-white dark:bg-slate-900 border rounded-xl p-2.5"></textarea>
              </div>
            ))}
          </div>
        </div>
        <button onClick={handleSaveRecipe} className="w-full bg-gradient-to-r from-amber-500 to-rose-500 text-white font-bold py-3.5 rounded-xl shadow-lg">Publish Gourmet Masterpiece</button>
      </div>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: COOKBOOK FAVORITES VIEW
// =========================================================================
function FavoritesView({ favorites, recipes, onSelectRecipe, onRemoveFavorite }) {
  return (
    <div className="space-y-6 animate-fadeIn">
      <div><h3 className="text-xl font-bold">My Personal Cookbook Collection</h3><p className="text-xs text-slate-400">Your custom saved and liked dynamic recipe plans</p></div>
      {favorites.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800"><Heart className="w-12 h-12 text-slate-300 mx-auto mb-3" /><h4 className="font-extrabold text-lg">Your Cookbook Collection is Empty</h4></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {favorites.map(fav => {
            const fullRecipe = recipes.find(r => r.id === fav.recipeId) || { id: fav.recipeId, name: fav.name, cover: fav.cover, cuisine: fav.cuisine, cookTime: fav.time };
            const isUrl = fav.cover?.startsWith('http');
            return (
              <div key={fav.id} className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <div className="relative h-40">
                  {isUrl ? <img src={fav.cover} className="w-full h-full object-cover" alt="fav" /> : <CoverPlaceholder gradientClass={fav.cover} />}
                </div>
                <div className="p-4 space-y-3"><h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">{fav.name}</h4></div>
                <div className="px-4 pb-4 flex gap-2">
                  <button onClick={() => onSelectRecipe(fullRecipe)} className="flex-1 bg-slate-50 dark:bg-slate-800 py-2 rounded-xl text-xs font-bold text-center">View</button>
                  <button onClick={() => onRemoveFavorite(fullRecipe)} className="p-2 text-rose-500 bg-rose-500/10 rounded-xl"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: WEEKLY MEAL PLANNER VIEW
// =========================================================================
function MealPlannerView({ recipes, mealPlan, user, addToast }) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const [activeDay, setActiveDay] = useState("Monday");
  const [breakfast, setBreakfast] = useState("");
  const [lunch, setLunch] = useState("");
  const [dinner, setDinner] = useState("");

  useEffect(() => {
    if (mealPlan?.[activeDay]) { setBreakfast(mealPlan[activeDay].breakfast || ""); setLunch(mealPlan[activeDay].lunch || ""); setDinner(mealPlan[activeDay].dinner || ""); } 
    else { setBreakfast(""); setLunch(""); setDinner(""); }
  }, [activeDay, mealPlan]);

  const handleSaveDayPlan = async () => {
    if (!user) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'meal_plans', 'current');
      await setDoc(docRef, { ...mealPlan, [activeDay]: { breakfast, lunch, dinner } });
      addToast(`Meal Plan for ${activeDay} updated successfully`, "success");
    } catch (e) { addToast("Failed to save meal plan", "error"); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div><h3 className="text-xl font-bold">Weekly Dining Architect</h3><p className="text-xs text-slate-400">Configure calorie targets, dynamic breakfast, lunches, and dinners</p></div>
        <div className="flex flex-wrap gap-1 bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-2xl">
          {days.map(d => (
            <button key={d} onClick={() => setActiveDay(d)} className={`flex-1 min-w-[80px] py-2 rounded-xl text-xs font-bold transition-all ${activeDay === d ? 'bg-amber-500 text-white' : 'text-slate-500'}`}>{d.substring(0,3)}</button>
          ))}
        </div>
        <div className="space-y-4">
          <h4 className="font-bold text-sm text-amber-500">{activeDay}'s Plan</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border space-y-2"><span className="text-[10px] font-extrabold text-slate-400 uppercase">Breakfast</span><input type="text" value={breakfast} onChange={(e) => setBreakfast(e.target.value)} placeholder="e.g. Avocado Toast" className="w-full text-xs bg-white dark:bg-slate-900 border rounded-xl p-2.5" /></div>
            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border space-y-2"><span className="text-[10px] font-extrabold text-slate-400 uppercase">Lunch</span><input type="text" value={lunch} onChange={(e) => setLunch(e.target.value)} placeholder="e.g. Quinoa Salmon Salad" className="w-full text-xs bg-white dark:bg-slate-900 border rounded-xl p-2.5" /></div>
            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border space-y-2"><span className="text-[10px] font-extrabold text-slate-400 uppercase">Dinner</span><input type="text" value={dinner} onChange={(e) => setDinner(e.target.value)} placeholder="e.g. Rack of Lamb" className="w-full text-xs bg-white dark:bg-slate-900 border rounded-xl p-2.5" /></div>
          </div>
          <button onClick={handleSaveDayPlan} className="w-full bg-gradient-to-r from-amber-500 to-rose-500 text-white font-bold py-3 rounded-xl shadow">Save {activeDay} Schedule</button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: SHOPPING LIST VIEW
// =========================================================================
function ShoppingListView({ shoppingList, user, addToast }) {
  const [newItem, setNewItem] = useState("");
  const [quantity, setQuantity] = useState("1");

  const handleAddShoppingItem = async (e) => {
    e.preventDefault();
    if (!newItem.trim() || !user) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'shopping_lists'), { name: newItem, amount: quantity, checked: false, timestamp: Date.now() });
      setNewItem(""); setQuantity("1");
      addToast("Added to grocery list", "success");
    } catch (err) { addToast("Failed to write to list", "error"); }
  };

  const handleToggleCheck = async (item) => {
    if (!user) return;
    try { await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'shopping_lists', item.id), { checked: !item.checked }); } catch (e) {}
  };

  const handleDeleteItem = async (id) => {
    if (!user) return;
    try { await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'shopping_lists', id)); addToast("Removed item", "info"); } catch (e) {}
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div><h3 className="text-xl font-bold">Smart Grocery Shopping Index</h3><p className="text-xs text-slate-400">Keep inventory of necessary baking, cooking ingredients</p></div>
        <form onSubmit={handleAddShoppingItem} className="flex gap-2">
          <input type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Whole Milk" className="flex-1 text-xs py-3 px-4 bg-slate-50 dark:bg-slate-800 border rounded-xl focus:outline-none" />
          <input type="text" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Qty" className="w-16 text-xs text-center py-3 bg-slate-50 dark:bg-slate-800 border rounded-xl focus:outline-none" />
          <button type="submit" className="bg-rose-500 text-white font-bold px-4 rounded-xl text-xs">Add</button>
        </form>
        <div className="space-y-2">
          {shoppingList.map(item => (
            <div key={item.id} onClick={() => handleToggleCheck(item)} className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer ${item.checked ? 'opacity-60 line-through text-slate-400 bg-slate-50 dark:bg-slate-800' : 'bg-white dark:bg-slate-900'}`}>
              <span className="text-xs font-semibold">{item.name} ({item.amount})</span>
              <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: CHEF PROFILE
// =========================================================================
function ChefProfileView({ profile, myRecipes, followersCount, followingCount, totalLikes, onSelectRecipe, isAnonymous, onLoginClick }) {
  return (
    <div className="space-y-8 animate-fadeIn max-w-5xl mx-auto">
      <div className="relative rounded-3xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md">
        <div className={`h-40 bg-gradient-to-r ${profile.coverGradient || recipeGradients[0]} flex items-center justify-center`}>
          <ChefHat className="w-20 h-20 text-white/20" />
        </div>
        
        <div className="p-6 relative pt-0 -translate-y-12 mb-[-48px] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex items-end space-x-4">
              <Avatar name={profile.name} size="w-24 h-24" textClass="text-3xl" />
              <div>
                <h3 className="text-xl font-bold text-slate-950 dark:text-white leading-tight">{profile.name}</h3>
                <p className="text-xs text-slate-400">@{profile.username}</p>
              </div>
            </div>

            <div className="flex gap-4 text-center">
              <div>
                <p className="text-sm font-black text-slate-800 dark:text-white">{followersCount}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Followers</p>
              </div>
              <div>
                <p className="text-sm font-black text-slate-800 dark:text-white">{followingCount}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Following</p>
              </div>
              <div>
                <p className="text-sm font-black text-slate-800 dark:text-white">{totalLikes}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Likes</p>
              </div>
            </div>
          </div>
          
          <p className="text-xs text-slate-400 max-w-xl">{profile.bio}</p>

          {/* GUEST MODE: SIGN IN BANNER */}
          {isAnonymous && (
            <div className="pt-4">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-sm text-amber-600 dark:text-amber-400 flex items-center">
                    <UserCheck className="w-4 h-4 mr-1.5" /> You are browsing as a Guest
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Sign in to publish recipes, gain followers, and save your cookbook.</p>
                </div>
                <button 
                  onClick={onLoginClick}
                  className="shrink-0 bg-gradient-to-r from-amber-500 to-rose-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center space-x-1.5"
                >
                  <Lock className="w-4 h-4" />
                  <span>Sign In / Register</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-extrabold text-lg mb-4">My Published Culinary Masterpieces</h3>
        {myRecipes.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No published recipes yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {myRecipes.map(recipe => (
              <RecipeCard key={recipe.id} recipe={recipe} onSelect={onSelectRecipe} onLike={() => {}} liked={false} isAnonymous={isAnonymous} onLikeDirect={() => {}} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: PUBLIC CHEF PROFILE
// =========================================================================
function PublicChefProfileView({ selectedUsername, recipes, user, following, followers, onFollowChef, onBack, onSelectRecipe, isAnonymous }) {
  const chefRecipeList = useMemo(() => {
    return recipes.filter(r => r.createdByChef === selectedUsername || r.createdByChef?.toLowerCase() === selectedUsername?.toLowerCase());
  }, [recipes, selectedUsername]);

  const totalLikes = useMemo(() => {
    return chefRecipeList.reduce((acc, curr) => acc + (curr.likes?.length || 0), 0);
  }, [chefRecipeList]);

  const targetChefUid = chefRecipeList[0]?.createdByUid || "chef-mock-uid";
  const isFollowing = following.some(f => f.chefUid === targetChefUid && f.followerUid === user?.uid);

  return (
    <div className="space-y-8 animate-fadeIn max-w-5xl mx-auto">
      <button onClick={onBack} className="flex items-center space-x-2 text-xs font-semibold text-slate-500 hover:text-rose-500">
        <ArrowLeft className="w-4 h-4" /><span>Back to Discover Feed</span>
      </button>

      <div className="relative rounded-3xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md">
        <div className={`h-40 bg-gradient-to-r ${recipeGradients[0]} flex items-center justify-center`}>
          <ChefHat className="w-20 h-20 text-white/20" />
        </div>
        <div className="p-6 relative pt-0 -translate-y-12 mb-[-48px] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex items-end space-x-4">
              <Avatar name={selectedUsername} size="w-24 h-24" textClass="text-3xl" />
              <div>
                <h3 className="text-xl font-bold text-slate-950 dark:text-white leading-tight">Chef {selectedUsername}</h3>
                <p className="text-xs text-slate-400">@{selectedUsername?.toLowerCase()}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex gap-4 text-center">
                <div>
                  <p className="text-sm font-black text-slate-800 dark:text-white">12</p>
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Followers</p>
                </div>
                <div>
                  <p className="text-sm font-black text-slate-800 dark:text-white">{totalLikes}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Likes</p>
                </div>
              </div>

              {targetChefUid !== user?.uid && (
                <button 
                  onClick={() => onFollowChef(targetChefUid, selectedUsername)}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all border ${
                    isFollowing ? 'bg-slate-100 text-slate-600' : 'bg-rose-500 text-white'
                  }`}
                >
                  {isFollowing ? "Following" : "Follow Chef"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-bold text-base mb-4">Recipes by @{selectedUsername}</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {chefRecipeList.map(recipe => (
            <RecipeCard key={recipe.id} recipe={recipe} onSelect={onSelectRecipe} onLike={() => {}} liked={false} isAnonymous={isAnonymous} onLikeDirect={() => {}} />
          ))}
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: SETTINGS
// =========================================================================
function SettingsView({ profile, setProfile, darkMode, setDarkMode, addToast, user }) {
  const [name, setName] = useState(profile.name || "");
  const [username, setUsername] = useState(profile.username || "");
  const [bio, setBio] = useState(profile.bio || "");

  const handleUpdateProfile = async () => {
    if (!user) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'info');
      const updated = { ...profile, name, username, bio };
      await setDoc(docRef, updated);
      setProfile(updated);
      addToast("Preferences updated successfully!", "success");
    } catch (e) {
      addToast("Failed to write settings", "error");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div><h3 className="text-xl font-bold">Preferences & Profile settings</h3></div>
        <div className="space-y-4">
          <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Chef Full Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl p-3" /></div>
          <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Chef Handle Name</label><input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl p-3" /></div>
          <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Chef Bio</label><textarea rows="3" value={bio} onChange={(e) => setBio(e.target.value)} className="w-full text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl p-3" ></textarea></div>
          <button onClick={handleUpdateProfile} className="w-full bg-rose-500 text-white font-bold py-3 rounded-xl">Apply Preferences</button>
        </div>
      </div>
    </div>
  );
}

