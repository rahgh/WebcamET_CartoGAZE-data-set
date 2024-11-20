let eyeTrackingData = []; // array to store eye tracking data
let fixationData = []; // array to store fixation data
let resultsCollected = {}; // collection of results from tasks
let previousGaze = null;
let surveyAnswer = {}; // variable to store the survey answers
let calibrationAccuracy = 0; // variable to store calibration accuracy
let PointCalibrate = 0;
let CalibrationPoints = {};
let lastEyeCheckTime_ms = Date.now();
let clickCounter = 0;
let isEyePositionCorrect = false
let currentStream = null; // Store the current stream globally
let stream_width = null;
let stream_height = null;
const eyeCheckDelay_ms = 250; // check every 300 ms
const sufficientMeasurementAccuracy = 50;  // sufficient percentage of accuracy
const userId = generateUniqueUserId();  // unique user ID
let failedCalibrationAttempts = 0; // nr of failed calibration attempts
const maxCalibrationAttempts = 3;  // maximum calibration attempts

// modals

let introductionText = document.getElementById("introduction-text");

let consentCheckbox = document.getElementById("consentCheckbox");

let notice_element = document.getElementById("notice");

let info_modal = document.getElementById("research-info-modal");
let info_modal_btn = info_modal.querySelector('button');

let stay_still_modal = document.getElementById("stay-still-modal");
let stay_still_modal_btn = stay_still_modal.querySelector('button');

let camera_modal = document.getElementById("camera-modal");
let camera_modal_btn = camera_modal.querySelector('button');

let face_check_modal = document.getElementById("face-check-modal");

// record the width and height of the screen in pixels
const screenWidth_px = window.innerWidth
const screenHeight_px = window.innerHeight

console.log("Screen width: " + screenWidth_px + " pixels");
console.log("Screen height: " + screenHeight_px + " pixels");

consentCheckbox.onclick = () => {
    if (consentCheckbox.checked) {
        // delay the transition to let the check mark appear
        setTimeout(() => {
            hide_element(introductionText);
            show_element(notice_element);// Show notice text
            show_element(info_modal);
        }, 400); // 400 milliseconds delay
    }
};

info_modal_btn.onclick = () => {
    hide_element(notice_element);
    hide_element(info_modal);
    show_element(stay_still_modal);
};

stay_still_modal_btn.onclick = () => {
    hide_element(stay_still_modal);
    show_element(camera_modal);
};

camera_modal_btn.onclick = () => {
    testCameraAccess();
    setTimeout(() => {}, 2000); // wait till camera video appears on page
    hide_element(camera_modal);
    stopCameraFeed();
    show_element(face_check_modal);
    // button of face_check_modal calls 'startCalibration' function
};

console.log(`>>> user ID = ${userId}`);

show_element(introductionText); // Show introduction text

//==================================================

// sleep function <http://stackoverflow.com/q/951021>
function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

// show or hide HTML elements
function show_element(element) {
    if (element) {
        element.style.display = 'block';
    }
}

function hide_element(element) {
    if (element) {
        element.style.display = 'none';
    }
}

// request camera access
function testCameraAccess() {
    console.log("Requesting camera access...");
    navigator.mediaDevices.getUserMedia({ video: true })
        .then((stream) => {
            const videoElement = document.getElementById('camera-feed');
            videoElement.srcObject = stream;
            videoElement.play();
            document.getElementById('camera-allow-btn').disabled = true;
        })
        .catch((error) => {
            console.error('Camera access denied', error);
            alert('Camera access is required for this study.');
        });
}

function retryCamera() {
    hide_element(face_check_modal);
    document.getElementById('camera-allow-btn').disabled = false;
    show_element(camera_modal);
}

// stop the camera feed
function stopCameraFeed() {
    const videoElement = document.getElementById('camera-feed');
    if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject;
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop()); // stop each track
        videoElement.srcObject = null;        // disconnect the stream from the video element
    }

    console.log('Camera stopped.');
}

//=== USER ID ===
async function getIP() {
    try {
        const response = await fetch("https://api.ipify.org?format=json");
        const data = await response.json();
        return data.ip
    } catch (error) {
        console.error("Error fetching IP address:", error);
        return undefined;
    }
}

// function to generate a unique user ID
function generateUniqueUserId() {
    // current timestamp
    const timestamp = Date.now();

    // random number between 0 and 9999
    const randomNum = Math.floor(Math.random() * 10000);

    // combine timestamp and random number to create a unique ID
    const uniqueId = `user-${timestamp}-${randomNum.toString().padStart(4, '0')}`;

    return uniqueId;
}

//=== WEBGAZER ===

// WebGazer listener
function WebGazerListener(data, elapsedTime, checkEyePosition) {
    if (data) {
        const xprediction = data.x;
        const yprediction = data.y;
        const timestamp_ms = Date.now();

        // verify the correct eye position
        if (checkEyePosition) {
            const timeSinceLastGaze = timestamp_ms - lastEyeCheckTime_ms;
            if (timeSinceLastGaze >= eyeCheckDelay_ms) {
                lastEyeCheckTime_ms = timestamp_ms;
                const videoElement = document.getElementById('webgazerVideoFeed');
                const checkEyes = checkEyesInValidationBox(videoElement, data.eyeFeatures);
                console.log(`checkEyesInValidationBox = ${checkEyes}`);
                updateValidationBoxColor(checkEyes);
                if (checkEyes === 1) {
                    setTimeout(() => {
                        webgazer.showVideo(false);
                        webgazer.showFaceFeedbackBox(false);
                    }, 1000); // hide video after 1 second of correct position
                } else {
                    webgazer.showVideo(true);
                    webgazer.showFaceFeedbackBox(true);
                    showAlert('Please keep your head in front of your webcam.');
                }
            }
        }

        // calculate the saccade amplitude if there's previous gaze data
        let saccadeAmplitude = 0;
        if (previousGaze) {
            const distance = Math.sqrt(Math.pow(xprediction - previousGaze.x, 2)
                + Math.pow(yprediction - previousGaze.y, 2));
            saccadeAmplitude = distance / window.innerWidth * 100; // percentage relative to screen width

            if (distance < 20) { // threshold for fixation detection
                if (fixationData.length > 0) {
                    const lastFixation = fixationData[fixationData.length - 1];
                    lastFixation.fixation_ends_at_ms = timestamp_ms;
                    lastFixation.fixation_duration_ms = timestamp_ms - lastFixation.fixation_starts_at_ms;
                } else {
                    fixationData.push({
                        fixation_point_x: xprediction,
                        fixation_point_y: yprediction,
                        fixation_starts_at_ms: timestamp_ms,
                        fixation_ends_at_ms: null,
                        fixation_duration_ms: null
                    });
                }
            }
        }

        // store eye tracking and saccade data
        eyeTrackingData.push({
            gaze_x_percent: (xprediction / window.innerWidth) * 100,
            gaze_y_percent: (yprediction / window.innerHeight) * 100,
            gaze_timestamp_ms: timestamp_ms,
            saccade_amplitude_percent: saccadeAmplitude
        });

        previousGaze = { x: xprediction, y: yprediction };
    }
}

function updateValidationBoxColor(checkEyes) {
    const faceFeedbackBox = document.querySelector('.faceFeedbackBox');
    if (faceFeedbackBox) {
        switch(checkEyes) {
            case 1:
                faceFeedbackBox.style.border = '2px solid green';
                break;
            case -1:
                faceFeedbackBox.style.border = '2px solid red';
                break;
            default:
                faceFeedbackBox.style.border = '2px solid black';
        }
    }
}

function showAlert(message) {
    const alertDiv = document.getElementById('eyeTrackingAlert') || createAlertDiv();
    alertDiv.textContent = message;
    alertDiv.style.display = 'block';
    setTimeout(() => { alertDiv.style.display = 'none'; }, 3000); // hide after 3 seconds
}

function createAlertDiv() {
    const div = document.createElement('div');
    div.id = 'eyeTrackingAlert';
    div.style.cssText = 'position: fixed; top: 10px; left: 50%; transform: translateX(-50%); background-color: #ffcccc; padding: 10px; border-radius: 5px; z-index: 1000;';
    document.body.appendChild(div);
    return div;
}

function initWebGazer() {
    // initialize WebGazer and start eye tracking
    console.log('Initializing WebGazer...');
    // ensure WebGazer is properly configured
    webgazer.params.showVideo = true; // or true, depending on your needs
    webgazer.params.showFaceOverlay = false; // hide the face overlay
    webgazer.params.showFaceFeedbackBox = true; // hide the face feedback box
    webgazer.params.saveDataAcrossSessions = false;
    webgazer.setRegression('ridge'); // currently must set regression and tracker
    webgazer.showVideoPreview(true) // shows all video previews
      .showPredictionPoints(true) // shows a square every 100 milliseconds where current prediction is
      .applyKalmanFilter(true); // Kalman filter

    let previewWidth = webgazer.params.videoViewerWidth;
    let previewHeight = webgazer.params.videoViewerHeight;

    lastEyeCheckTime_ms = Date.now();
    const eyeCheckDelay_ms = 500; // time interval to check the eye position

    // set WebGazer listener to acquire the data
    webgazer.setGazeListener(function (data, elapsedTime)
                             { WebGazerListener(data, elapsedTime, false); });

    // start WebGazer
    webgazer.begin();
    // start calibration process
    showCalibrationInitMessage();
}

// check eyes in the validation box using WebGazer's built-in logic
function checkEyesInValidationBox(videoElement, eyeFeatures) {
    if (eyeFeatures && videoElement) {
        var w = videoElement.videoWidth;
        var h = videoElement.videoHeight;

        // find the size of the box.
        // pick the smaller of the two video preview sizes
        var smaller = Math.min(w, h);
        var boxSize = smaller * webgazer.params.faceFeedbackBoxRatio;

        // set the boundaries of the face overlay validation box based on the preview
        var topBound = (h - boxSize) / 2;
        var leftBound = (w - boxSize) / 2;
        var rightBound = leftBound + boxSize;
        var bottomBound = topBound + boxSize;

        //get the x and y positions of the left and right eyes
        var eyeLX = eyeFeatures.left.imagex;
        var eyeLY = eyeFeatures.left.imagey;
        var eyeRX = eyeFeatures.right.imagex;
        var eyeRY = eyeFeatures.right.imagey;

        var xPositions = false;
        var yPositions = false;

        // check if the x values for the left and right eye are within the validation box
        // add the width when comparing against the rightBound (which is the left edge on the preview)
        if (eyeLX > leftBound && eyeLX + eyeFeatures.left.width < rightBound) {
            if (eyeRX > leftBound && eyeRX + eyeFeatures.right.width < rightBound) {
                xPositions = true;
            }
        }

        // check if the y values for the left and right eye are within the validation box
        if (eyeLY > topBound && eyeLY + eyeFeatures.left.height < bottomBound) {
            if (eyeRY > topBound && eyeRY + eyeFeatures.right.height < bottomBound) {
                yPositions = true;
            }
        }

        // if the x and y values for both the left and right eye are within
        // the validation box then the box border turns green, otherwise if
        // the eyes are outside of the box the colour is red
        if (xPositions && yPositions){
            return 1; // inside the box, green border
        } else {
            return -1; // outside the box, red border
        }
    } else
        return 0; // return black border if no valid eyeFeatures or videoElement
}

function collectResults(eyeTrackingData, fixationData, surveyAnswer)
{
    // function to collect all results
    let eye_tracking_data = [];
    eyeTrackingData.forEach((data, index) => {
        eye_tracking_data.push({'index': index,
            'x': data.gaze_x_percent, 'y': data.gaze_y_percent,
            'timestamp_ms': data.gaze_timestamp_ms,
            'saccade_amplitude_percent': data.saccade_amplitude_percent});
    });

    let fixation_data = [];
    fixationData.forEach((data, index) => {
        fixation_data.push({'index': index,
            'fixation_point_x': data.fixation_point_x,
            'fixation_point_y': data.fixation_point_y,
            'fixation_duration_ms': data.fixation_duration_ms,
            'fixation_end_at_ms': data.fixation_ends_at_ms});
    });

    let results = {'user_id': userId,
        'calibration_accuracy': calibrationAccuracy,
        'eye_tracking_data': eye_tracking_data,
        'fixation_data': fixation_data,
        'survey_answer': surveyAnswer,
        'screen_width_px': screenWidth_px,
	'screen_height_px': screenHeight_px,
		
    };

    return results;
}

function resetWebGazerData()
{
    eyeTrackingData = []; // array to store eye tracking data
    fixationData = []; // array to store fixation data
}

//========================================

//=== CALIBRATION ===

// show the calibration initial instructions
function showCalibrationInitMessage() {
    const modal_ = document.getElementById("calibration-init-message");
    let modal_btn = modal_.querySelector('button');

    modal_btn.onclick = () => {
        hide_element(modal_);
        loadCalibrationCanvas();
    };

    show_element(modal_);
}

function startCalibration() {
    console.log('Starting calibration...');
    hide_element(document.getElementById('notice'));
    hide_element(face_check_modal);
    console.log('initialize WebGazer...');
    initWebGazer(); // initialize WebGazer
}

/*
 * load this function when the calibration starts.
 * This function listens for button clicks on the html page
 * checks that all buttons have been clicked 5 times each,
 * and then goes on to measuring the precision
*/
function loadCalibrationCanvas() {
    console.log("Loading calibration canvas...");
    showCalibrationCanvas();

    // click event on the calibration buttons
    document.querySelectorAll('.calibration-point').forEach((button) => {
        button.addEventListener('click', () => {
            calPointClick(button);
        });
    });
}

function calPointClick(calib_node) {
    const node_id = calib_node.id;

    // initialize the calibration points if not done
    if (!CalibrationPoints[node_id]) {
        CalibrationPoints[node_id] = 0;
    }

    CalibrationPoints[node_id]++; // increment the click count

    // change color and disable button after 5 clicks
    if (CalibrationPoints[node_id] === 5) {
        calib_node.style.setProperty('background-color', 'yellow');
        calib_node.setAttribute('disabled', 'disabled');
        PointCalibrate++;
    } else if (CalibrationPoints[node_id] < 5) {
        // gradually increase the opacity of calibration points on click
        const opacity = 0.2 * CalibrationPoints[node_id] + 0.2;
        calib_node.style.setProperty('opacity', opacity);
    }

    // show the middle calibration point after all other points have been clicked
    if (PointCalibrate === 8) {
        document.getElementById('Pt5').style.setProperty('display', 'block');
    }

    if (PointCalibrate >= 9) { // last point is calibrated
        // hide all elements in calibration class except the middle point
        document.querySelectorAll('.calibration-point').forEach((button) => {
            button.style.setProperty('display', 'none');
        });

        // clear the canvas
        const canvas = document.getElementById("plotting_canvas");
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        // show the middle point again for the final focus
        document.getElementById('Pt5').style.setProperty('display', 'block');

        // hide WebGazer red dot
        webgazer.showPredictionPoints(false);

        // delay showing the modal notification for the measurement process by 1 second
        setTimeout(() => {
            let calibration_accuracy_elm = document.getElementById("calibration-accuracy");
            calibration_accuracy_elm.querySelector('button').onclick = () => {
                // calculate accuracy
                hide_element(calibration_accuracy_elm);
                webgazer.showPredictionPoints(true);
                calcAccuracy();
            };

            show_element(calibration_accuracy_elm);
        }, 500); // 500 milliseconds = 0.5 second
    }
}

function calibrationAccuracyModal(accuracy) {
    // main div element
    const modal = document.createElement('div');
    modal.id = 'calibration-low-accuracy';
    modal.className = 'modal';

    // modal-content div
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';

    // paragraph element
    const paragraph = document.createElement('p');
    // paragraph.textContent = `Measurement accuracy is ${accuracy}%.`;

    // button
    const button = document.createElement('button');
    button.className = 'modal-button';

    const isAccuracySufficient = accuracy > sufficientMeasurementAccuracy;
    if (!isAccuracySufficient) {
        failedCalibrationAttempts++; // Increment failed attempts counter

        if (failedCalibrationAttempts >= maxCalibrationAttempts) {
            // If failed three times, show the final message
            paragraph.textContent = 'Calibration was unsuccessful, and we cannot proceed with the experiment. ' +
                'If you are still interested in taking the study, please reload the link to the survey again. ' +
                'Thank you for your time! Please close this window.';
            button.textContent = 'End Experiment';
        } else {
            paragraph.textContent = 'Please repeat the calibration.';
            button.textContent = 'Recalibrate';
        }
    } else {
        paragraph.textContent = 'Calibration is successful!';
        button.textContent = 'Continue';
    }

    // append elements to build the structure
    modalContent.appendChild(paragraph);
    modalContent.appendChild(button);
    modal.appendChild(modalContent);
    modal.style.display = 'none';

    // add the modal to the body of the document
    return [modal, isAccuracySufficient];
}

function calcAccuracy() {
    // start storing the WebGazer prediction points for 5 seconds
    webgazer.params.storingPoints = true;

    sleep(5000).then(() => {
        // stop storing the prediction points
        webgazer.params.storingPoints = false;
        webgazer.pause();

        clearCanvas();
        webgazer.showPredictionPoints(false); // hide WebGazer points

        var past50 = webgazer.getStoredPoints(); // retrieve the stored points
        var precision_measurement = calculatePrecision(past50);
        calibrationAccuracy = precision_measurement;  // <-- Store the accuracy here
        let [accuracy_precision_modal, isAccuracySufficient] =
            calibrationAccuracyModal(precision_measurement);

        console.log(`Measurement accuracy = ${precision_measurement}, isAccuracySufficient = ${isAccuracySufficient}`);

        document.body.appendChild(accuracy_precision_modal);

        // check if accuracy is acceptable
        if (!isAccuracySufficient) {
            accuracy_precision_modal.querySelector('button').onclick = () => {
                hide_element(accuracy_precision_modal);
                 if (failedCalibrationAttempts >= maxCalibrationAttempts) {
                     console.log('Calibration failed after 3 attempts.');
                    // Add logic to end the experiment or disable further actions
                } else {
                    console.log(`Recalibrate due to low accuracy (${precision_measurement}%)...`);
                    // show WebGazer red dot
                    webgazer.showPredictionPoints(true);
                    recalibrate();
                }
            };
        } else {
            accuracy_precision_modal.querySelector('button').onclick = () => {
                hide_element(accuracy_precision_modal);
                endCalibration();
            };
        }

        show_element(accuracy_precision_modal);
    });
}

// show calibration points
function showCalibrationCanvas() {
    let calibration_elm = document.getElementById("calibration-container");
    show_element(calibration_elm);

    document.querySelectorAll('.calibration-point').forEach((button) => {
        button.style.setProperty('background-color', 'red');
        button.style.setProperty('opacity', '0.2');
        button.style.display = 'block';
    });

    // initially hides the middle button
    document.getElementById('Pt5').style.setProperty('display', 'none');
}

// clear the calibration buttons memory
function clearCalibration() {
  // clear data from WebGazer

  document.querySelectorAll('.calibration-point').forEach((button) => {
    button.style.setProperty('background-color', 'red');
    button.style.setProperty('opacity', '0.2');
    button.removeAttribute('disabled');
  });

  CalibrationPoints = {};
  PointCalibrate = 0;
}

// clear the canvas and hide calibration points after calibration
function clearCanvas() {
    // hide all calibration points
    document.querySelectorAll('.calibration-point').forEach((button) => {
        button.style.display = 'none'; // ensure calibration points are hidden
    });

    // clear the canvas
    var canvas = document.getElementById("plotting_canvas");
    if (canvas) {
        var context = canvas.getContext('2d');  // get the canvas 2D context
        context.clearRect(0, 0, canvas.width, canvas.height);  // clear the canvas
        context.fillStyle = "white";  // set fill style to white
        context.fillRect(0, 0, canvas.width, canvas.height);  // fill the canvas with white
    }
}

function recalibrate() {
    // clear stored data in WebGazer
    webgazer.clearData();  // Clear all stored gaze data
    clearCalibration();
    clearCanvas();

    // reset WebGazer configuration to ensure it can start again correctly
    webgazer.resume();  // Ensure WebGazer is running and ready to collect data again
    webgazer.params.storingPoints = false;  // Disable storing points until calibration starts

    // call the function to show the calibration canvas
    showCalibrationCanvas();
}

// calculate the precision of WebGazer measurement
function calculatePrecision(past50Array) {
    var windowHeight = window.innerHeight;
    var windowWidth = window.innerWidth;

    // retrieve the last 50 gaze prediction points
    var x50 = past50Array[0];
    var y50 = past50Array[1];

    // calculate the position of the point the user is staring at
    var staringPointX = windowWidth / 2;
    var staringPointY = windowHeight / 2;

    var precisionPercentages = new Array(50);
    calculatePrecisionPercentages(precisionPercentages, windowHeight,
                                  x50, y50, staringPointX, staringPointY);

    // calculate average
    var precision = 0;
    for (x = 0; x < 50; x++) {
        precision += precisionPercentages[x];
    }

    precision = precision / 50;

    // return the precision measurement as a rounded percentage
    return Math.round(precision);
}

/*
 * Calculate percentage accuracy for each prediction based on distance of
 * the prediction point from the centre point (uses the window height as
 * lower threshold 0%)
 */
function calculatePrecisionPercentages(precisionPercentages, windowHeight,
                                       x50, y50, staringPointX, staringPointY) {
    for (x = 0; x < 50; x++) {
        // calculate distance between each prediction and staring point
        var xDiff = staringPointX - x50[x];
        var yDiff = staringPointY - y50[x];
        var distance = Math.sqrt((xDiff * xDiff) + (yDiff * yDiff));

        // calculate precision percentage
        var halfWindowHeight = windowHeight / 2;
        var precision = 0;
        if (distance <= halfWindowHeight && distance > -1) {
            precision = 100 - (distance / halfWindowHeight * 100);
        } else if (distance > halfWindowHeight) {
            precision = 0;
        } else if (distance > -1) {
            precision = 100;
        }

        // store the precision
        precisionPercentages[x] = precision;
    }
}

function endCalibration() {
    console.log('Stopping Calibration...');
    webgazer.pause(); // pause WebGazer

    // hide calibration Points and Clear Canvas
    clearCalibrationCanvas();

    // hide WebGazer dot
    webgazer.showPredictionPoints(false); // hide WebGazer points

    // show the training modal
    showTrainingModal("training-task-modal", "eye-tracking-message-modal", task1_0);
}

// clear the canvas and hide calibration points after calibration
function clearCalibrationCanvas() {
    // hide all calibration points
    document.querySelectorAll('.calibration-point').forEach((button) => {
        button.style.display = 'none'; // ensure calibration points are hidden
    });

    // clear the canvas
    var canvas = document.getElementById("plotting_canvas");
    var context = canvas.getContext('2d');  // get the canvas 2D context
    context.clearRect(0, 0, canvas.width, canvas.height);  // clear the canvas
    context.fillStyle = "white";  // set fill style to white
    context.fillRect(0, 0, canvas.width, canvas.height);  // fill the canvas with white

    document.getElementById('calibration-container').style.display = 'none';
}

//=== TRAINING MODAL ===

// function to show the Training Task Modal
function showTrainingModal(train_modal_id, eye_tracking_message_modal_id, next_task)
{
    console.log(`Show training modal '${train_modal_id}'...`);

    // ensure WebGazer video and overlays are turned off
    webgazer.showVideo(false);
    webgazer.showFaceOverlay(false);
    webgazer.showFaceFeedbackBox(false);
    // no need to gather data
    webgazer.pause();

    webgazer.setGazeListener(function(data, elapsedTime) {
        WebGazerListener(data, elapsedTime, true);
    });

    const train_task_modal = document.getElementById(train_modal_id);
    if (!train_task_modal) {
        console.error(`Training modal '${train_modal_id}' not found!`);
        return;
    }

    // show the training task modal
    show_element(train_task_modal);

    // add click event for the button inside train_task_modal
    const train_task_modal_btn = train_task_modal.querySelector(".modal-button");
    if (!train_task_modal_btn) {
        console.error(`No button found for training modal '${training_modal_id}'!`);
        return;
    }

    train_task_modal_btn.onclick = function() {
        hide_element(train_task_modal);
        // display the eye-tracking message modal
        const eye_tracking_msg_modal = document.getElementById(eye_tracking_message_modal_id);
        show_element(eye_tracking_msg_modal);
        // add click event for the button inside eye_tracking_msg_modal
        const eye_tracking_msg_modal_btn = eye_tracking_msg_modal.querySelector(".modal-button");
        if (eye_tracking_msg_modal_btn) {
            eye_tracking_msg_modal_btn.onclick = function() {
                hide_element(eye_tracking_msg_modal);

                // run training task
                next_task();
            };
        };
    };
}

//=== MAIN MODAL ===

// function to show the main modal
function showMainModal(main_task_modal_id, next_task) {
    console.log(`Showing main modal ${main_task_modal_id}...`);

    // get the main task modal element
    const main_task_modal = document.getElementById(main_task_modal_id);
    if (main_task_modal) {
        show_element(main_task_modal);
    } else {
        console.error(`Main task modal ${main_task_modal_id} not found!`);
        return; // exit if modal is not found
    }

    // ensure WebGazer video and overlays are turned off
    webgazer.params.showVideo = false;
    webgazer.params.showFaceOverlay = false;
    webgazer.params.showFaceFeedbackBox = false;

    // no need to gather data
    webgazer.pause();

    webgazer.setGazeListener(function(data, elapsedTime) {
        WebGazerListener(data, elapsedTime, true);
    });

    // show the Main task modal
    show_element(main_task_modal);

    // get the button inside the main task modal
    const main_task_modal_btn = main_task_modal.querySelector(".modal-button");

    if (main_task_modal_btn) {
        main_task_modal_btn.onclick = function() {
            hide_element(main_task_modal);
            show_element(document.getElementById('map_1'));

            // run next task
            next_task();
        };
    } else {
        console.error(`No button found for main task modal ${main_task_modal_id}!`);
    }
}

//=== GENERIC TASK ===

function showTask(figure_id, survey_modal_id, delay_ms, next_task, send_data) {
    console.log('Begin showTask...');

    const survey_modal = document.getElementById(survey_modal_id);
    console.log(`Trying to display element with ID: ${figure_id}`);

    // connect buttons of the survey modal to `submitAnswer` function
    const modalButtons = survey_modal.querySelectorAll('.modal-button');
    modalButtons.forEach(button => {
        // avoid adding multiple event listeners by first removing any existing one
        button.removeEventListener('click', handleButtonClick);
        button.addEventListener('click', handleButtonClick);
    });

    function handleButtonClick(event) {
        const button = event.target;
        const surveyAnswer = button.id;
        const correctAnswer = survey_modal.getAttribute('correctAnswer');

        hide_element(survey_modal);
        // submit survey answer
        console.log(`Selected Answer for '${survey_modal_id}': '${surveyAnswer}'`);
        console.log(`Correct Answer for '${survey_modal_id}': '${correctAnswer}'`);

        // collect the data
        resultsCollected[survey_modal_id] = collectResults(eyeTrackingData, fixationData, surveyAnswer);

        // submit results to the web app
        if (send_data) {
            submitResultsToCloud(resultsCollected);
            resultsCollected = {};
        }

        // reset eye tracking data for next task
        resetWebGazerData();

        if (correctAnswer) {
            if(surveyAnswer === correctAnswer) {
                alert("Answer is correct!");
            } else {
                alert(`Answer is incorrect! The correct answer was '${correctAnswer}'.`);
            }
        }

        // perform the next task
        next_task();
    }

    // show the map and initialize eye tracking
    show_element(document.getElementById(figure_id));
    console.log(`Display figure ${figure_id}`);

    // start WebGazer to collect data
    webgazer.resume();

    // stop eye tracking after the delay
    setTimeout(() => {
        console.log('Pause eye tracking...');
        webgazer.pause(); // pause WebGazer

        // hide the figure
        hide_element(document.getElementById(figure_id));

        // display the survey
        console.log(`Show ${survey_modal_id}...`);
        show_element(survey_modal);

        // next task will be performed when a survey button is pressed
    }, delay_ms);

    console.log('End of showTask...');
}

//========== TASK DEFINITIONS ==========

// Training Task 0
function task1_0() {
    // training task
    console.log("Begin Task 1");
    const figure_id = "map_0";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal-0";
    const next_task = function () {showMainModal("main-task-modal", task1_1)};
    const send_data = false; // do not send data for the training task

    showTask(figure_id, survey_modal_id, delay_ms, next_task, send_data);
}

// Task 1
function task1_1() {
    console.log("Begin Task 1_1");
    const figure_id = "map_1";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal-1";
    const next_task = task1_2;

    // start the task
    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task1_2() {
    console.log("Begin Task 1_2");
    const figure_id = "map_2";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal-2";
    const next_task = task1_3;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task1_3() {
    console.log("Begin Task 1_3");
    const figure_id = "map_3";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal-3";
    const next_task = task1_4;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task1_4() {
    console.log("Begin Task 1_4");
    const figure_id = "map_4";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal-4";
    const next_task = task1_5;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}
function task1_5() {
    console.log("Begin Task 1_5");
    const figure_id = "map_5";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal-5";
    const next_task = task1_6;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task1_6() {
    console.log("Begin Task 1_6");
    const figure_id = "map_6";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal-6";
    const next_task = task1_7;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task1_7() {
    console.log("Begin Task 1_7");
    const figure_id = "map_7";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal-7";
    const next_task = task1_8;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task1_8() {
    console.log("Begin Task 1_8");
    const figure_id = "map_8";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal-8";
    const next_task = task1_9;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task1_9() {
    console.log("Begin Task 1_9");
    const figure_id = "map_9";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal-9";
    const next_task = task1_10;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task1_10() {
    console.log("Begin Task 1_10");
    const figure_id = "map_10";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal-10";
    const next_task = function() {
        // show training task modal 2 before starting task 2-1
        showTrainingModal("training-task-modal_2", "eye-tracking-message-modal_2", task2_0);
    };

    const send_data = true;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, send_data);
}

//========================================

// Training task 2
function task2_0() {
    console.log("Begin Task 2");

    const figure_id =  "map2_0";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal2-0";
    const next_task = task2_1;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

// Task 2
function task2_1() {
    console.log("Begin Task 2_1");
    const figure_id = "map2_1";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal2-1";
    const next_task = task2_2;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task2_2() {
    console.log("Begin Task 2_2");
    const figure_id = "map2_2";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal2-2";
    const next_task = task2_3;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task2_3() {
    console.log("Begin Task 2_3");
    const figure_id = "map2_3";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal2-3";
    const next_task = task2_4;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task2_4() {
    console.log("Begin Task 2_4");
    const figure_id = "map2_4";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal2-4";
    const next_task = task2_5;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task2_5() {
    console.log("Begin Task 2_5");
    const figure_id = "map2_5";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal2-5";
    const next_task = task2_6;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task2_6() {
    console.log("Begin Task 2_6");
    const figure_id = "map2_6";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal2-6";
    const next_task = task2_7;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task2_7() {
    console.log("Begin Task 2_7");
    const figure_id = "map2_7";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal2-7";
    const next_task = task2_8;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task2_8() {
    console.log("Begin Task 2_8");
    const figure_id = "map2_8";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal2-8";
    const next_task = task2_9;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task2_9() {
    console.log("Begin Task 2_9");
    const figure_id = "map2_9";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal2-9";
    const next_task = task2_10;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task2_10() {
    console.log("Begin Task 2_10");
    const figure_id = "map2_10";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal2-10";
    const next_task = function () {
        showTrainingModal("training-task-modal_3", "eye-tracking-message-modal_3", task3_0);
    };

    const send_data = true;
    // show Task 2-10 and after the survey is submitted, start the training task for task 3
    showTask(figure_id, survey_modal_id, delay_ms, next_task, send_data);
}

//========================================

// Training task 3
function task3_0()
{
    // training task_3
    console.log("Begin Task 3");

    const figure_id =  "map3_0";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal3-0";
    const next_task = task3_1;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

// Task 3
function task3_1() {
    console.log("Begin Task 3_1");
    const figure_id = "map3_1";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal3-1";
    const next_task = task3_2;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task3_2() {
    console.log("Begin Task 3_2");
    const figure_id = "map3_2";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal3-2";
    const next_task = task3_3;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task3_3() {
    console.log("Begin Task 3_3");
    const figure_id = "map3_3";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal3-3";
    const next_task = task3_4;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task3_4() {
    console.log("Begin Task 3_4");
    const figure_id = "map3_4";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal3-4";
    const next_task = task3_5;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}
function task3_5() {
    console.log("Begin Task 3_5");
    const figure_id = "map3_5";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal3-5";
    const next_task = task3_6;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task3_6() {
    console.log("Begin Task 3_6");
    const figure_id = "map3_6";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal3-6";
    const next_task = task3_7;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task3_7() {
    console.log("Begin Task 3_7");
    const figure_id = "map3_7";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal3-7";
    const next_task = task3_8;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task3_8() {
    console.log("Begin Task 3_8");
    const figure_id = "map3_8";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal3-8";
    const next_task = task3_9;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task3_9() {
    console.log("Begin Task 3_9");
    const figure_id = "map3_9";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal3-9";
    const next_task = task3_10;

    showTask(figure_id, survey_modal_id, delay_ms, next_task, false);
}

function task3_10() {
    console.log("Begin Task 3_10");
    const figure_id = "map3_10";
    const delay_ms = 7000;
    const survey_modal_id = "survey-modal3-10";
    const next_task = closeUserInfo;

    const send_data = true;
    showTask(figure_id, survey_modal_id, delay_ms, next_task, send_data);
}

//========================================

function closeUserInfo() {
    // close the user info modal and show thanks message
    hide_element(document.getElementById('survey-modal3-10'));
    // display a thank you message
    show_element(document.getElementById('final-message'));
    console.log("Survey finished");
}

// function to start the short survey (Google Form link)
function startShortSurvey() {
    const modal = document.getElementById("final-message");
    modal.style.display = "none";
    window.open("https://forms.gle/NWvTHmhsn7XaRtpf7", "_blank");
}

//========================================

function submitResultsToCloud(results) {
    // submit results to the cloud (Google Apps Script)
    console.log("Submitting the data to cloud");
    const textData = JSON.stringify(results);
    console.log(`Text data:\n"""\n${textData}\n"""`);

    // saveJSONFile(textData); // DEBUG

    const google_script_url = "https://script.google.com/macros/s/AKfycbz-6qR8ORSn9Og4NX0yhzKV-ROC-Kls7keuPRtvIBl35754cQaMYjlxZSByMnzR938Z/exec";

    fetch(google_script_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'no-cors',  // no-cors mode
        body: textData,  // assuming textData is already a JSON string
    })
    .then(() => {
        console.log('Data successfully sent to the cloud');  // since no response is available, just log a success message
    })
    .catch(error => {
        console.error('Error sending data to the cloud:', error);
    });
}

function saveJSONFile(data_str) {
   let bl = new Blob([data_str], {
      type: "application/json"  // correct MIME type for JSON file
   });

   let a = document.createElement("a");
   a.href = URL.createObjectURL(bl);
   a.download = "data.json";  // correct file extension
   a.hidden = true;
   document.body.appendChild(a);
   a.click();  // automatically triggers the download
}
