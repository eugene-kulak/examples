import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import {
	Header,
	Grid,
	Segment,
	Sidebar,
	Dimmer,
	Loader,
	Confirm,
	Dropdown
} from 'semantic-ui-react';
import SettingBar from './Sidebar/Sidebar';
import Statistic from './Statistic/Statistic';
import liveCamera from '../assets/live_camera.png';
import DetectedObject from './DetectedObject/DetectedObject';
import Graph from './Graph/Graph';
import mqtt from 'mqtt';
import { CameraPayload } from '../mqtt/camera_payload_pb';
import { displaySuccess, displayError, generateGuid } from '../utils/helpers';
import Addr from 'ip6addr';
import { DEFAULT_REACT_APP_MQTT_BROKER_PORT, DEFAULT_REACT_APP_MESH_SERVICE_PORT, DEVICES_ENDPOINT, noDataTimeout, AddressType, MAX_LENGTH } from '../constants/mqttConstant';

let client = null, clientLiveView = null;

const graphOptions = [
	{ key: 'length', text: 'Length', value: '1' },
	{ key: 'width', text: 'Width', value: '2' },
	{ key: 'height', text: 'Height', value: '3' },
	{ key: 'ascore', text: 'A-Score', value: '4' }
]

let imageData = [];

const HomePage = ({
	showSidebar,
	toggleSidebar,
	...props
}) => {
	const [connected, setConnected] = React.useState(false);
	const [serverError, setServerError] = React.useState(false);
	const [endPoint, setEndpoint] = React.useState(null);
	const [endPoints, setEndpoints] = React.useState([]);
	const [imageDataArray, setImageDataArray] = React.useState([]);
	const [detectedObjects, setDetectedObjects] = React.useState(new Array(9).fill({ acceptance: true }));
	const [detectedAnomalies, setDetectedAnomalies] = React.useState(0);
	const [graphOption, setGraphOption] = React.useState('length');
	const [live1, setLive1] = React.useState('');
	const [live2, setLive2] = React.useState('');

	const loadEndpoints = () => {
		setEndpoints([{
			address: '0.0.0.0',
			key: '',
			text: '',
			value: ''
		}]);
		setEndPoint(endPoints[0]);
		console.log('loadEndpoints');
	}

	const connectToMesh = () => {
		loadEndpoints();
	}

	const retry = () => {
		console.log('retry');
		setServerError(false);
		connectToMesh();
	}

	const cancelRetry = () => {
		setServerError(false);
		setConnected(false);
	}

	const setEndPoint = (endPoint) => {
		setEndpoint(endPoint);
		connect();
		connectLiveView();
	}

	const addImageData = (image) => {
		console.time('build new image data array');
		let newImageDataArray = imageData.slice();

		if (newImageDataArray.length === 0) {
			newImageDataArray.push(image);
		} else {
			for (var i = 0; i < newImageDataArray.length; i++) {
				if (newImageDataArray[i].timestamp === image.timestamp) {
					newImageDataArray[i].src = image.src;
					break;
				}
				if (i === newImageDataArray.length - 1) {
					if (newImageDataArray.length >= MAX_LENGTH) {
						newImageDataArray.shift();
					}
					newImageDataArray.push(image);
					break;
				}
			}
		}
		imageData = newImageDataArray.slice();
		console.timeEnd('build new image data array');
		checkReplaceNewValues(newImageDataArray);
	}

	const getFullData = (data) => {
		let result = [];
		for (var i = 0; i < data.length; i++) {
			if (data[i].src === undefined || data[i].height === undefined || data[i].width === undefined || data[i].timestamp === undefined || data[i].ascore === undefined) {
				continue;
			}
			result.push(data[i]);
		}

		return result;
	}

	const checkReplaceNewValues = (newImageDataArray) => {
		let newDetectedObjects;
		newImageDataArray = getFullData(imageData);
		newImageDataArray = newImageDataArray.sort((x, y) => x.timestamp - y.timestamp);
		let length = newImageDataArray.length;
		let detectedObjectLength = 8;
		if (document.body.clientWidth < 768) {
			detectedObjectLength = 9;
		}
		if (length <= detectedObjectLength) {
			newDetectedObjects = newImageDataArray.slice().concat(new Array(detectedObjectLength - length).fill({ acceptance: true }));
		} else {
			let rest = length % detectedObjectLength;
			let restArray = newImageDataArray.slice(length - rest - 1, length - 1);
			let lastArray = newImageDataArray.slice(length - detectedObjectLength - 1, length - rest - 1);
			newDetectedObjects = restArray.concat(lastArray);
		}
		if (newImageDataArray.length !== imageDataArray.length) {
			console.time('set detected objects');
			setDetectedObjects(newDetectedObjects);
			console.timeEnd('set detected objects');
			console.time('set image data');
			setImageDataArray(newImageDataArray);
			console.timeEnd('set image data');
		}
	}

	const addGeomData = (geomData) => {
		let newImageDataArray = imageData.slice();

		if (newImageDataArray.length === 0) {
			newImageDataArray.push({ ...geomData, acceptance: true });
		} else {
			for (var i = 0; i < newImageDataArray.length; i++) {
				if (newImageDataArray[i].timestamp === 1 * geomData.id) {
					newImageDataArray[i].width = geomData.width;
					newImageDataArray[i].height = geomData.height;
					newImageDataArray[i].length = geomData.length;
					newImageDataArray[i].acceptance = true;
					break;
				}
				if (i === newImageDataArray.length - 1) {
					if (newImageDataArray.length >= MAX_LENGTH) {
						newImageDataArray.shift();
					}
					newImageDataArray.push({ timestamp: 1 * geomData.id, width: geomData.width, height: geomData.height, length: geomData.length, acceptance: true });
					break;
				}
			}
		}
		imageData = newImageDataArray.slice();
		checkReplaceNewValues(newImageDataArray);
	}

	const addScoreData = (scoreData) => {
		let newImageDataArray = imageData.slice();

		if (newImageDataArray.length === 0) {
			newImageDataArray.push({ ...scoreData, acceptance: true });
		} else {
			for (var i = 0; i < newImageDataArray.length; i++) {
				if (newImageDataArray[i].timestamp === 1 * scoreData.id) {
					newImageDataArray[i].ascore = scoreData.a_score.toFixed(1);
					newImageDataArray[i].acceptance = true;
					break;
				}
				if (i === newImageDataArray.length - 1) {
					if (newImageDataArray.length >= MAX_LENGTH) {
						newImageDataArray.shift();
					}
					newImageDataArray.push({ timestamp: 1 * scoreData.id, ascore: scoreData.a_score.toFixed(1), acceptance: true });
					break;
				}
			}
		}
		imageData = newImageDataArray.slice();
		checkReplaceNewValues(newImageDataArray);
	}

	React.useEffect(() => {
		setImageDataArray(checkSetting(imageDataArray));
		checkReplaceNewValues(imageDataArray);

	}, [props.setting, imageDataArray])


	const checkSetting = (newImageDataArray) => {
		let totalFalse = 0;
		for (var i = 0; i < newImageDataArray.length; i++) {
			let totalDisabled = 0;
			Object.keys(props.setting).map(key => {
				if (props.setting[key].option === "0") {
					if (newImageDataArray[i][key] >= props.setting[key].amount) {
						newImageDataArray[i].acceptance = false;
					}
				} else if (props.setting[key].option === "1") {
					if (newImageDataArray[i][key] <= props.setting[key].amount) {
						newImageDataArray[i].acceptance = false;
					}
				} else {
					totalDisabled++;
				}
			});
			if (totalDisabled === Object.keys(props.setting).length) {
				newImageDataArray[i].acceptance = true;
			}
			if (newImageDataArray[i].acceptance === false) {
				totalFalse++;
			}
		}
		setDetectedAnomalies(totalFalse);
		return newImageDataArray;
	}

	const connectLiveView = (endpoint) => {
		let subscribtionInterval1 = null;
		let subscribtionInterval2 = null;
		try {
			const url = `ws://${document.location.hostname}:${DEFAULT_REACT_APP_MQTT_BROKER_PORT}`;
			clientLiveView = mqtt.connect(url);

			clientLiveView.on('connect', () => {
				setConnected(true);
				clientLiveView.subscribe('live1/preview', (err) => {
					if (err) {
						console.log('Subscribtion error', JSON.stringify(err));
					}
					else {
						console.log(`MQTT Client subscribed to topic "live1"`);
						subscribtionInterval1 = setInterval(() => {
							disconnect(true);
							clearInterval(subscribtionInterval1);
						}, noDataTimeout);
					}
				});
				clientLiveView.subscribe('live2/preview', (err) => {
					if (err) {
						console.log('Subscribtion error', JSON.stringify(err));
					}
					else {
						console.log(`MQTT Client subscribed to topic "live2"`);
						subscribtionInterval2 = setInterval(() => {
							disconnect(true);
							clearInterval(subscribtionInterval2);
						}, noDataTimeout);
					}
				});
			});

			clientLiveView.on('message', (topic, message) => {
				if (subscribtionInterval1) {
					clearInterval(subscribtionInterval1);
				}
				if (subscribtionInterval2) {
					clearInterval(subscribtionInterval2);
				}
				const { data } = CameraPayload.deserializeBinary(message).toObject();
				const src = "data:image/jpeg;base64," + data;
				if (topic === 'live2/preview') {
					setLive2(src);
				} else if (topic === 'live1/preview') {
					setLive1(src);
				}
				setConnected(false);
			});

			clientLiveView.on('error', (err) => {
				console.log(err);
				displayError('Error in MQTT Client connection', JSON.stringify(err));
			});
		}
		catch (e) {
			displayError('Error in MQTT Client connection: ' + JSON.stringify(e));
		}
	}

	const connect = () => {
		let subscribtionInterval = null;
		let subscribtionInterval1 = null;
		let subscribtionInterval2 = null;
		let subscribtionInterval3 = null;
		let subscribtionInterval4 = null;
		let subscribtionInterval5 = null;

		try {
			const url = `ws://${document.location.hostname}:${process.env.REACT_APP_MQTT_BROKER_PORT || DEFAULT_REACT_APP_MQTT_BROKER_PORT}`;
			client = mqtt.connect(url);

			client.on('connect', () => {
				setConnected(true);

				// client.subscribe(endpoint.key + '/preview', (err) => {
				client.subscribe('cropped_donut1/preview', (err) => {
					if (err) {
						console.log('Subscribtion error', JSON.stringify(err));
					}
					else {
						console.log(`MQTT Client subscribed to topic "cropped_donut1"`);
						subscribtionInterval = setInterval(() => {
							disconnect(true);
							clearInterval(subscribtionInterval);
						}, noDataTimeout);
					}
				});
				client.subscribe('cropped_donut2/preview', (err) => {
					if (err) {
						console.log('Subscribtion error', JSON.stringify(err));
					}
					else {
						console.log(`MQTT Client subscribed to topic "cropped_donut2"`);
						subscribtionInterval1 = setInterval(() => {
							disconnect(true);
							clearInterval(subscribtionInterval1);
						}, noDataTimeout);
					}
				});
				client.subscribe('geom_donut1/json', (err) => {
					if (err) {
						console.log('Subscribtion error', JSON.stringify(err));
					}
					else {
						console.log(`MQTT Client subscribed to topic "geom_donut1"`);
						subscribtionInterval2 = setInterval(() => {
							disconnect(true);
							clearInterval(subscribtionInterval2);
						}, noDataTimeout);
					}
				});

				client.subscribe('geom_donut2/json', (err) => {
					if (err) {
						console.log('Subscribtion error', JSON.stringify(err));
					}
					else {
						console.log(`MQTT Client subscribed to topic "geom_donut2"`);
						subscribtionInterval3 = setInterval(() => {
							disconnect(true);
							clearInterval(subscribtionInterval3);
						}, noDataTimeout);
					}
				});

				client.subscribe('a_score1/json', (err) => {
					if (err) {
						console.log('Subscribtion error', JSON.stringify(err));
					}
					else {
						console.log(`MQTT Client subscribed to topic "a_score1"`);
						subscribtionInterval4 = setInterval(() => {
							disconnect(true);
							clearInterval(subscribtionInterval4);
						}, noDataTimeout);
					}
				});

				client.subscribe('a_score2/json', (err) => {
					if (err) {
						console.log('Subscribtion error', JSON.stringify(err));
					}
					else {
						console.log(`MQTT Client subscribed to topic "a_score2"`);
						subscribtionInterval5 = setInterval(() => {
							disconnect(true);
							clearInterval(subscribtionInterval5);
						}, noDataTimeout);
					}
				});
			});

			client.on('message', (topic, message) => {
				if (subscribtionInterval) {
					clearInterval(subscribtionInterval);
				}
				if (subscribtionInterval1) {
					clearInterval(subscribtionInterval1);
				}
				if (subscribtionInterval2) {
					clearInterval(subscribtionInterval2);
				}
				if (subscribtionInterval3) {
					clearInterval(subscribtionInterval3);
				}
				if (subscribtionInterval4) {
					clearInterval(subscribtionInterval4);
				}
				if (subscribtionInterval5) {
					clearInterval(subscribtionInterval5);
				}

				switch(topic){
					case 'cropped_donut1/preview':
					case 'cropped_donut2/preview':
						const { data, timestamp } = CameraPayload.deserializeBinary(message).toObject();
						const src = "data:image/jpeg;base64," + data;
						console.time('AddImageData ' + topic);
						addImageData({ src, timestamp });
						console.timeEnd('AddImageData ' + topic);
						break;
					case 'geom_donut1/json':
					case 'geom_donut2/json':
						addGeomData(JSON.parse(message.toString()));
						break;
					case 'a_score1/json':
					case 'a_score2/json':
						addScoreData(JSON.parse(message.toString()));
						break;
				}

				setConnected(false);
			});

			client.on('error', (err) => {
				console.log(err);
				displayError('Error in MQTT Client connection', JSON.stringify(err));
			});
		}
		catch (e) {
			displayError('Error in MQTT Client connection: ' + JSON.stringify(e));
		}
	};

	const disconnect = (isTimeout) => {
		client.unsubscribe(endPoint, (err) => {
			if (!err) {
				isTimeout ? displayError(`Unable to retrieve the data`) : displaySuccess(`MQTT Client unsubscribed from topic "${endPoint}"`);
				setEndpoint(null);
				setConnected(false);
			}
		});
		clientLiveView.unsubscribe(endPoint, (err) => {
			if (!err) {
				isTimeout ? displayError(`Unable to retrieve the data`) : displaySuccess(`MQTT Client unsubscribed from topic "${endPoint}"`);
				setEndpoint(null);
				setConnected(false);
			}
		});
	};

	const onChangeGraphOption = (e, result) => {
		console.log(result.options[1 * result.value - 1].key);
		setGraphOption(result.options[1 * result.value - 1].key);
	}

	React.useEffect(() => {
		connectToMesh();
	}, []);

	return (
		<Sidebar.Pushable as={Segment} className="main-container">
			<SettingBar visible={showSidebar} toggleSidebar={() => toggleSidebar()} />

			<Sidebar.Pusher>
				<Grid className="main-page">
					<Grid.Column width={7} className="first-col">
						<div className="card-container">
							<Header as="h3" className="section-title">Live Camera</Header>
							<div className="live-camera">
								<img className="camera-img" alt="live2" src={live2 !== '' ? live2 : liveCamera} />
							</div>
							<div className="live-camera right">
								<img className="camera-img" alt="live1" src={live1 !== '' ? live1 : liveCamera} />
							</div>
						</div>
						<div className="driver-container">
							<Header as="h3" className="section-title">Statistics</Header>
							<div className="table-wrapper">
								<Statistic statisticData={imageDataArray.reverse()} />
							</div>
						</div>
					</Grid.Column>
					<Grid.Column width={9} className='second-col'>
						<div className="object-container">
							<div className="detect-object-header">
								<Header as="h3" className="section-title">Detected Objects</Header>
								<Header as="h5" className="detected-analyze">
									All Objects: {imageDataArray.length} | Detected Anomalies: {detectedAnomalies}
								</Header>
							</div>
							<DetectedObject imageData={detectedObjects} />
							<Header as="h5" className="detected-analyze-mobile">
								All Objects: {imageDataArray.length} | Detected Anomalies: {detectedAnomalies}
							</Header>
						</div>
						<div className="graph-container">
							<div className="graph-header">
								<Header as="h3" className="section-title">Graphs</Header>
								<Dropdown className="graph-options" onChange={onChangeGraphOption} defaultValue='1' options={graphOptions} />
							</div>
							<Graph option={graphOption} graphData={imageDataArray} />
						</div>
					</Grid.Column>
				</Grid>
				<Dimmer active={connected} inverted >
					<Loader>Connecting...</Loader>
				</Dimmer>
				<Dimmer active={serverError} inverted >
					<Loader>Can not connect to server</Loader>
				</Dimmer>
				<Confirm
					open={serverError}
					content='There is problem on connecting server, Are you going to try again?'
					onCancel={cancelRetry}
					onConfirm={retry}
				/>
			</Sidebar.Pusher>
		</Sidebar.Pushable>
	);
};

function mapStateToProps(state) {
	return {
		setting: state.setting
	}
}

HomePage.propTypes = {
	showSidebar: PropTypes.bool.isRequired,
	toggleSidebar: PropTypes.func.isRequired,
	setting: PropTypes.object.isRequired
}

export default connect(mapStateToProps, null)(HomePage);

