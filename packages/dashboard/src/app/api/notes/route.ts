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

    // If no notes found, create demo notes
    if (notes.length === 0) {
      notes.push(
        {
          id: `demo-note-1-${Date.now()}`,
          type: 'reflection',
          title: 'World Exploration Strategy',
          content:
            'The world appears to be a plains biome with scattered trees. Should focus on gathering wood first, then explore for other resources like stone and food.',
          timestamp: Date.now() - 1800000, // 30 minutes ago
          source: 'demo',
          confidence: 0.8,
        },
        {
          id: `demo-note-2-${Date.now()}`,
          type: 'reflection',
          title: 'Resource Prioritization',
          content:
            'Wood is the most accessible resource and essential for crafting tools. Should prioritize tree gathering before attempting to mine stone.',
          timestamp: Date.now() - 900000, // 15 minutes ago
          source: 'demo',
          confidence: 0.9,
        },
        {
          id: `demo-note-3-${Date.now()}`,
          type: 'reflection',
          title: 'Safety Considerations',
          content:
            'Night time brings increased danger from hostile mobs. Should ensure adequate lighting and shelter before nightfall.',
          timestamp: Date.now() - 300000, // 5 minutes ago
          source: 'demo',
          confidence: 0.7,
        }
      );
    }

    // Sort notes by timestamp (newest first)
    notes.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json({
      notes: notes.slice(0, 10), // Limit to 10 most recent notes
      totalNotes: notes.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Return demo data on error
    return NextResponse.json({
      notes: [
        {
          id: `demo-note-1-${Date.now()}`,
          type: 'reflection',
          title: 'World Exploration Strategy',
          content:
            'The world appears to be a plains biome with scattered trees. Should focus on gathering wood first, then explore for other resources like stone and food.',
          timestamp: Date.now() - 1800000,
          source: 'demo',
          confidence: 0.8,
        },
        {
          id: `demo-note-2-${Date.now()}`,
          type: 'reflection',
          title: 'Resource Prioritization',
          content:
            'Wood is the most accessible resource and essential for crafting tools. Should prioritize tree gathering before attempting to mine stone.',
          timestamp: Date.now() - 900000,
          source: 'demo',
          confidence: 0.9,
        },
        {
          id: `demo-note-3-${Date.now()}`,
          type: 'reflection',
          title: 'Safety Considerations',
          content:
            'Night time brings increased danger from hostile mobs. Should ensure adequate lighting and shelter before nightfall.',
          timestamp: Date.now() - 300000,
          source: 'demo',
          confidence: 0.7,
        },
      ],
      totalNotes: 3,
      timestamp: new Date().toISOString(),
    });
  }
}
