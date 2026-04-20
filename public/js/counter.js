// nammaModalSystem is now provided by script.js

document.getElementById('counter1').addEventListener('click', async () => {
    const pineLabValue = await nammaModalSystem.prompt('Please enter the Pine Lab value:');
    if (pineLabValue) {
        saveCounterSelection('Counter 1', pineLabValue);
    }
});

document.getElementById('counter2').addEventListener('click', async () => {
    await nammaModalSystem.alert('Please ensure that the Paytm machine shift is being reset.');
    saveCounterSelection('Counter 2');
    setTimeout(() => {
        window.location.href = '/employee';
    }, 5000);
});

async function saveCounterSelection(counter, pineLabValue = null) {
    const employeeId = localStorage.getItem('employeeId');
    if (!employeeId) {
        await nammaModalSystem.alert('Employee ID not found. Please log in again.');
        return;
    }

    try {
        const response = await fetch('/api/counter-selection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                employeeId,
                counter,
                pineLabValue,
                timestamp: new Date().toISOString(),
            }),
        });

        const data = await response.json();

        if (data.success) {
            if (counter === 'Counter 1') {
                window.location.href = '/employee';
            }
        } else {
            await nammaModalSystem.alert('Failed to save counter selection. Please try again.');
        }
    } catch (error) {
        console.error('Error saving counter selection:', error);
        await nammaModalSystem.alert('An error occurred while saving counter selection.');
    }
}