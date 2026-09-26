/**
 * Event Additional Info Component
 * Displays agenda, speakers, prizes, and FAQs on public event pages
 */

"use client";

import React, { useState, useEffect } from 'react';
import { 
  getEventAdditionalInfo, 
  type AgendaItem, 
  type Speaker, 
  type Prize, 
  type Faq 
} from '@/lib/api/additional-info';
import { Calendar, Users, Award, HelpCircle, Clock, MapPin } from 'lucide-react';

interface EventAdditionalInfoProps {
  eventId: string;
}

export default function EventAdditionalInfo({ eventId }: EventAdditionalInfoProps) {
  const [activeTab, setActiveTab] = useState<'agenda' | 'speakers' | 'prizes' | 'faq'>('agenda');
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [eventId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getEventAdditionalInfo(eventId);
      setAgenda(data.agenda);
      setSpeakers(data.speakers);
      setPrizes(data.prizes);
      setFaqs(data.faqs);
    } catch (error) {
      console.error('Error loading additional info:', error);
    } finally {
      setLoading(false);
    }
  };

  // Don't show section if no data
  const hasData = agenda.length > 0 || speakers.length > 0 || prizes.length > 0 || faqs.length > 0;
  if (!hasData && !loading) return null;

  const tabs = [
    { id: 'agenda', label: 'Agenda', icon: Calendar, count: agenda.length },
    { id: 'speakers', label: 'Speakers', icon: Users, count: speakers.length },
    { id: 'prizes', label: 'Prizes', icon: Award, count: prizes.length },
    { id: 'faq', label: 'FAQ', icon: HelpCircle, count: faqs.length },
  ].filter(tab => tab.count > 0);

  if (tabs.length === 0 && !loading) return null;

  return (
    <div className="mt-12">
      <h2 className="text-3xl font-bold mb-6">Event Information</h2>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-3 rounded-full whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{tab.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.id ? 'bg-blue-500' : 'bg-gray-200'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      ) : (
        <>
          {/* Agenda */}
          {activeTab === 'agenda' && agenda.length > 0 && (
            <div className="space-y-4">
              {agenda.map((item) => (
                <div key={item.id} className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <Clock className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-sm font-semibold text-blue-600">
                          {new Date(item.start_time).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                          {item.end_time && ` - ${new Date(item.end_time).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}`}
                        </span>
                      </div>
                      <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                      {item.description && (
                        <p className="text-gray-600 mb-3">{item.description}</p>
                      )}
                      {item.location && (
                        <div className="flex items-center gap-2 text-gray-500">
                          <MapPin className="w-4 h-4" />
                          <span className="text-sm">{item.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Speakers */}
          {activeTab === 'speakers' && speakers.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {speakers.map((speaker) => (
                <div key={speaker.id} className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                  <div className="text-center">
                    {speaker.profile_image_url ? (
                      <img
                        src={speaker.profile_image_url}
                        alt={speaker.name}
                        className="w-24 h-24 rounded-full mx-auto mb-4 object-cover"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 mx-auto mb-4 flex items-center justify-center">
                        <span className="text-3xl font-bold text-white">
                          {speaker.name.charAt(0)}
                        </span>
                      </div>
                    )}
                    <h3 className="text-xl font-bold mb-1">{speaker.name}</h3>
                    {speaker.title && (
                      <p className="text-sm text-gray-600 mb-3">{speaker.title}</p>
                    )}
                    {speaker.bio && (
                      <p className="text-sm text-gray-500 line-clamp-3">{speaker.bio}</p>
                    )}
                    {speaker.is_featured && (
                      <span className="inline-block mt-3 px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded-full">
                        Featured Speaker
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Prizes */}
          {activeTab === 'prizes' && prizes.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {prizes.map((prize) => (
                <div key={prize.id} className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-16 h-16 bg-yellow-400 rounded-full flex items-center justify-center">
                        <Award className="w-8 h-8 text-yellow-900" />
                      </div>
                    </div>
                    <div className="flex-1">
                      {prize.position && (
                        <span className="inline-block px-3 py-1 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full mb-2">
                          {prize.position === 1 ? '🥇 1st Place' : 
                           prize.position === 2 ? '🥈 2nd Place' : 
                           prize.position === 3 ? '🥉 3rd Place' : 
                           `#${prize.position}`}
                        </span>
                      )}
                      <h3 className="text-xl font-bold mb-2">{prize.name}</h3>
                      {prize.description && (
                        <p className="text-gray-700 mb-3">{prize.description}</p>
                      )}
                      {prize.value && (
                        <p className="text-lg font-semibold text-blue-600">{prize.value}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* FAQ */}
          {activeTab === 'faq' && faqs.length > 0 && (
            <div className="space-y-4">
              {faqs.map((faq) => (
                <details key={faq.id} className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow group">
                  <summary className="p-6 cursor-pointer list-none">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <HelpCircle className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold group-open:text-blue-600">
                          {faq.question}
                        </h3>
                        {faq.category && (
                          <span className="inline-block mt-2 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                            {faq.category}
                          </span>
                        )}
                      </div>
                      <svg
                        className="w-5 h-5 text-gray-400 transition-transform group-open:rotate-180"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </summary>
                  <div className="px-6 pb-6 pt-0">
                    <div className="pl-10 text-gray-600 leading-relaxed">
                      {faq.answer}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
