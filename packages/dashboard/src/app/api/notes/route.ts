/**
 * Notes API
 * Provides reflective notes from the cognition system
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  try {
    const notes = [];

    // Fetch cognitive insights from planning system
    try {
      const cognitiveRes = await fetch(
        'http://localhost:3002/cognitive-insights'
      );
      if (cognitiveRes.ok) {
        const cognitiveData = await cognitiveRes.json();
        if (cognitiveData.insights && Array.isArray(cognitiveData.insights)) {
          for (const insight of cognitiveData.insights) {
            notes.push({
              id: insight.id || `insight-${Date.now()}`,
              type: 'reflection',
              title: insight.title || 'Cognitive Insight',
              content:
                insight.content ||
                insight.description ||
                'No content available',
              timestamp: insight.timestamp || Date.now(),
              source: 'cognition-system',
              confidence: insight.confidence || 0.5,
            });
          }
        }
      }
    } catch (error) {
      console.log('Cognitive insights unavailable');
    }

    // Fetch reflective notes from planning system
    try {
      const notesRes = await fetch('http://localhost:3002/notes');
      if (notesRes.ok) {
        const notesData = await notesRes.json();
        if (notesData.notes && Array.isArray(notesData.notes)) {
          for (const note of notesData.notes) {
            notes.push({
              id: note.id,
              type: note.type,
              title: note.title,
              content: note.content,
              timestamp: note.timestamp,
              source: 'planning-system',
              confidence: note.priority || 0.5,
            });
          }
        }
      }
    } catch (error) {
      console.log('Planning system notes unavailable');
    }

    // Fetch telemetry from cognition system
    try {
      const cognitionRes = await fetch('http://localhost:3003/telemetry');
      if (cognitionRes.ok) {
        const cognitionData = await cognitionRes.json();
        if (cognitionData.events) {
          for (const event of cognitionData.events) {
            if (event.type === 'reflection' || event.type === 'insight') {
              notes.push({
                id: event.id,
                type: 'reflection',
                title: event.type
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (l: string) => l.toUpperCase()),
                content:
                  event.data?.content || event.data?.description || event.type,
                timestamp: event.timestamp,
                source: 'cognition-system',
                confidence: event.data?.confidence || 0.5,
              });
            }
          }
        }
      }
    } catch (error) {
      console.log('Cognition system telemetry unavailable');
    }

    // Return empty array if no notes found - no demo data

    // Sort notes by timestamp (newest first)
    notes.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json({
      notes: notes.slice(0, 10), // Limit to 10 most recent notes
      totalNotes: notes.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching notes:', error);
    return NextResponse.json({
      notes: [],
      totalNotes: 0,
      timestamp: new Date().toISOString(),
      error: 'Failed to fetch notes',
    });
  }
}
