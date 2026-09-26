"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { brandGradient } from "@/lib/styles";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AvatarUpload from "@/components/AvatarUpload";
import { createClient } from "@/lib/supabase/client";
import { getProfile, updateProfile, createProfileIfNotExists } from "@/lib/api/profile";
import type { Profile } from "@/types/profile";

// Mock user data for stats and events (to be replaced with real API calls)
const mockUser = {
  stats: {
    eventsAttended: 12,
    eventsHosted: 3,
    ticketsBooked: 15,
  },
};

// Mock upcoming events
const upcomingEvents = [
  {
    id: "1",
    title: "Hack League 2026",
    date: "April 25, 2026",
    time: "10:00 AM",
    location: "Main Auditorium",
    status: "confirmed",
  },
  {
    id: "2",
    title: "Tech Talk: AI & ML",
    date: "April 30, 2026",
    time: "2:00 PM",
    location: "Seminar Hall",
    status: "confirmed",
  },
];

// Mock past events
const pastEvents = [
  {
    id: "3",
    title: "Cultural Fest 2026",
    date: "March 15, 2026",
    attended: true,
  },
  {
    id: "4",
    title: "Startup Summit",
    date: "February 20, 2026",
    attended: true,
  },
];

export default function ProfilePage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editedUser, setEditedUser] = useState({
    name: "",
    bio: "",
    phone: "",
    username: "",
  });
  const [saveError, setSaveError] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  const handleSaveProfile = async () => {
    setSaveError("");
    setSaveLoading(true);
    
    try {
      const updated = await updateProfile({
        name: editedUser.name,
        bio: editedUser.bio,
        phone: editedUser.phone.trim() === "" ? undefined : editedUser.phone.trim(),
        username: editedUser.username,
      });

      if (updated) {
        // Update profile state
        setProfile(updated);
        // Update edited user state to match
        setEditedUser({
          name: updated.name || "",
          bio: updated.bio || "",
          phone: updated.phone || "",
          username: updated.username || "",
        });
        // Exit edit mode
        setIsEditing(false);
      } else {
        setSaveError("Failed to update profile");
      }
    } catch (error: any) {
      setSaveError(error.message || "Failed to update profile");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCancelEdit = () => {
    if (profile) {
      setEditedUser({
        name: profile.name || "",
        bio: profile.bio || "",
        phone: profile.phone || "",
        username: profile.username || "",
      });
    }
    setSaveError("");
    setIsEditing(false);
  };

  useEffect(() => {
    // Check authentication with Supabase and load profile
    const checkAuth = async () => {
      const supabase = createClient();
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (session && !error) {
        setIsAuthenticated(true);
        
        // Load or create profile
        let userProfile = await getProfile();
        
        if (!userProfile) {
          // Create profile if it doesn't exist
          userProfile = await createProfileIfNotExists();
        }
        
        if (userProfile) {
          setProfile(userProfile);
          setEditedUser({
            name: userProfile.name || "",
            bio: userProfile.bio || "",
            phone: userProfile.phone || "",
            username: userProfile.username || "",
          });
        }
      } else {
        // Redirect to auth page if not logged in
        router.push("/auth");
      }
      setIsLoading(false);
    };

    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="min-h-screen bg-black overflow-x-hidden">
      <Navbar />

      {/* Profile Header */}
      <section className="relative pt-36 pb-16 px-6 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(52,145,255,0.1) 0%, transparent 70%)" }}
          aria-hidden="true"
        />
        
        <div className="relative z-10 max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-start gap-8">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {isEditing ? (
                <AvatarUpload
                  currentAvatarUrl={profile?.avatar_url}
                  userName={profile?.name}
                  onUploadSuccess={(url) => {
                    if (profile) {
                      setProfile({ ...profile, avatar_url: url });
                    }
                  }}
                  onDeleteSuccess={() => {
                    if (profile) {
                      setProfile({ ...profile, avatar_url: null });
                    }
                  }}
                />
              ) : (
                <>
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.name || "Profile"}
                      className="w-28 h-28 rounded-full object-cover border-2 border-white/10"
                    />
                  ) : (
                    <div
                      className="w-28 h-28 rounded-full flex items-center justify-center text-3xl font-bold text-white border-2 border-white/10"
                      style={{ background: brandGradient }}
                    >
                      {profile?.name ? profile.name.split(" ").map(n => n[0]).join("") : profile?.email?.[0].toUpperCase() || "U"}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* User Info */}
            <div className="flex-1">
              {saveError && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-sm text-red-400">{saveError}</p>
                </div>
              )}
              
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2">Full Name</label>
                    <input
                      type="text"
                      value={editedUser.name}
                      onChange={(e) => setEditedUser({ ...editedUser, name: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-slate-600 outline-none focus:border-[#3491ff] transition-colors"
                      placeholder="Enter your full name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2">Username</label>
                    <input
                      type="text"
                      value={editedUser.username}
                      onChange={(e) => setEditedUser({ ...editedUser, username: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-slate-600 outline-none focus:border-[#3491ff] transition-colors"
                      placeholder="Choose a unique username"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2">Bio</label>
                    <textarea
                      value={editedUser.bio}
                      onChange={(e) => setEditedUser({ ...editedUser, bio: e.target.value })}
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-slate-600 outline-none focus:border-[#3491ff] transition-colors resize-none"
                      placeholder="Tell us about yourself"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2">Phone</label>
                    <input
                      type="tel"
                      value={editedUser.phone}
                      onChange={(e) => setEditedUser({ ...editedUser, phone: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-slate-600 outline-none focus:border-[#3491ff] transition-colors"
                      placeholder="+1234567890 or +911234567890 (optional)"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Include country code (e.g., +1 for US, +91 for India)</p>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">
                    {profile?.name || "User"}
                  </h1>
                  {profile?.username && (
                    <p className="text-slate-400 mb-1">@{profile.username}</p>
                  )}
                  <p className="text-slate-400 mb-1">{profile?.email}</p>
                  {profile?.bio && (
                    <p className="text-slate-300 text-sm leading-relaxed max-w-2xl mt-4">
                      {profile.bio}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex lg:flex-col gap-3">
              {isEditing ? (
                <>
                  <button
                    onClick={handleSaveProfile}
                    disabled={saveLoading}
                    className="rounded-full px-6 py-2.5 text-sm font-semibold text-black transition-all duration-300 hover:shadow-[0_0_20px_rgba(52,145,255,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: brandGradient }}
                  >
                    {saveLoading ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={saveLoading}
                    className="rounded-full px-6 py-2.5 text-sm font-semibold border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="rounded-full px-6 py-2.5 text-sm font-semibold border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition-all duration-300"
                  >
                    Edit Profile
                  </button>
                  <button
                    onClick={handleLogout}
                    className="rounded-full px-6 py-2.5 text-sm font-semibold border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition-all duration-300"
                  >
                    Logout
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm">
              <p className="text-2xl font-bold text-white mb-1">{mockUser.stats.eventsAttended}</p>
              <p className="text-xs text-slate-500">Events Attended</p>
            </div>
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm">
              <p className="text-2xl font-bold text-white mb-1">{mockUser.stats.eventsHosted}</p>
              <p className="text-xs text-slate-500">Events Hosted</p>
            </div>
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm">
              <p className="text-2xl font-bold text-white mb-1">{mockUser.stats.ticketsBooked}</p>
              <p className="text-xs text-slate-500">Tickets Booked</p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Grid */}
      <section className="relative px-6 pb-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column */}
            <div className="lg:col-span-1 space-y-6">

              {/* Profile Details */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm">
                <h2 className="text-lg font-bold text-white mb-4">Contact Info</h2>
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">Email</label>
                      <input
                        type="email"
                        value={profile?.email || ""}
                        disabled
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-500 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">Phone</label>
                      <input
                        type="tel"
                        value={editedUser.phone}
                        onChange={(e) => setEditedUser({ ...editedUser, phone: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#3491ff] transition-colors"
                        placeholder="+1234567890 (optional)"
                      />
                      <p className="text-[9px] text-slate-600 mt-1">Include country code</p>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">Member Since</label>
                      <input
                        type="text"
                        value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ""}
                        disabled
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-500 cursor-not-allowed"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] text-slate-500 mb-1">Email</p>
                      <p className="text-xs text-white">{profile?.email || "Not provided"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 mb-1">Phone</p>
                      <p className="text-xs text-white">{profile?.phone || "Not provided"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 mb-1">Member Since</p>
                      <p className="text-xs text-white">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : "Not available"}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>


            {/* Right Column - Events */}
            <div className="lg:col-span-2">
              <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm">
                <h2 className="text-2xl font-bold text-white mb-6">My Events</h2>

                {/* Tabs */}
                <div className="flex gap-4 mb-6 border-b border-white/10">
                  <button
                    onClick={() => setActiveTab("upcoming")}
                    className={`pb-3 px-4 text-sm font-semibold transition-colors relative ${
                      activeTab === "upcoming" ? "text-white" : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    Upcoming
                    {activeTab === "upcoming" && (
                      <div
                        className="absolute bottom-0 left-0 right-0 h-0.5"
                        style={{ background: brandGradient }}
                      />
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("past")}
                    className={`pb-3 px-4 text-sm font-semibold transition-colors relative ${
                      activeTab === "past" ? "text-white" : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    Past Events
                    {activeTab === "past" && (
                      <div
                        className="absolute bottom-0 left-0 right-0 h-0.5"
                        style={{ background: brandGradient }}
                      />
                    )}
                  </button>
                </div>

                {/* Tab Content */}
                <div>
                  {activeTab === "upcoming" && (
                    <div className="space-y-4">
                      {upcomingEvents.map((event) => (
                        <div
                          key={event.id}
                          className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm hover:border-white/20 transition-all duration-300"
                        >
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div className="flex-1">
                              <h3 className="text-lg font-bold text-white mb-2">{event.title}</h3>
                              <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                                <div className="flex items-center gap-2">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  <span>{event.date}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <span>{event.time}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  </svg>
                                  <span>{event.location}</span>
                                </div>
                              </div>
                            </div>
                            <a
                              href={`/event/${event.id}/register/success`}
                              className="rounded-full px-6 py-2.5 text-sm font-semibold text-black transition-all duration-300 hover:shadow-[0_0_20px_rgba(52,145,255,0.4)] text-center"
                              style={{ background: brandGradient }}
                            >
                              View Ticket
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === "past" && (
                    <div className="space-y-4">
                      {pastEvents.map((event) => (
                        <div
                          key={event.id}
                          className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-lg font-bold text-white mb-2">{event.title}</h3>
                              <p className="text-sm text-slate-400">{event.date}</p>
                            </div>
                            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                              Attended
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
