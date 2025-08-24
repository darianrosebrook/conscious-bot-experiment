/**
 * Test script for intrusive thought submission
 *
 * @author @darianrosebrook
 */

async function testIntrusiveThoughtSubmission() {
  console.log('Testing intrusive thought submission...');

  try {
    // Test the cognitive-stream endpoint
    const response1 = await fetch(
      'http://localhost:3000/api/ws/cognitive-stream',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'intrusive',
          content: 'Test intrusive thought from script',
          attribution: 'intrusive',
          context: {
            emotionalState: 'curious',
            confidence: 0.8,
          },
          metadata: {
            messageType: 'intrusion',
            intent: 'external_suggestion',
          },
        }),
      }
    );

    if (response1.ok) {
      const result1 = await response1.json();
      console.log('✅ Cognitive-stream endpoint working:', result1);
    } else {
      console.log(
        '❌ Cognitive-stream endpoint failed:',
        response1.status,
        response1.statusText
      );
    }

    // Test the intrusive API endpoint
    const response2 = await fetch('http://localhost:3000/api/intrusive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Test intrusive thought via API from script',
        tags: ['external', 'intrusion'],
        strength: 0.8,
      }),
    });

    if (response2.ok) {
      const result2 = await response2.json();
      console.log('✅ Intrusive API endpoint working:', result2);
    } else {
      console.log(
        '❌ Intrusive API endpoint failed:',
        response2.status,
        response2.statusText
      );
    }

    console.log('✅ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testIntrusiveThoughtSubmission();
