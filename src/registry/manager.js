const fs = require("fs");
const path = require("path");
const util = require("util");
const semver = require("semver");
const RegistryApiServer = require("../net/registry/api");
const RegistryUserManager = require("./user/manager");
const DatabaseHandler = require("../db/handler");

module.exports = class RegistryManager {
	constructor(app) {
		this.app = app;

		this.db = new DatabaseHandler("librimods");
		this.users = new RegistryUserManager(this.app);
		this.apiServer = new RegistryApiServer(this.app);
	}

	async initialize() {
		await this.db.connect();
		this.collection = this.db.collection("registry");
		this.users.initialize();
		this.apiServer.initialize();
	}

	async terminate() {
		await this.db.close();
	}

	
	get(name) {
		return this.collection.findOne({name});
	}

	async publish(config, data) {
		if(config.name === undefined || !semver.valid(config.version) || config.author === undefined) return;

		let librimod = await this.get(config.name);

		if(librimod === null) {
			librimod = {
				name: config.name,
				version: config.version,
				author: config.author,
				versions: [{value: config.version, createdAt: new Date().getTime(), updatedAt: new Date().getTime()}],
				createdAt: new Date().getTime(),
				updatedAt: new Date().getTime()
			};

			await this.collection.insertOne(librimod);
		}
		else {
			if(semver.gt(config.version, librimod.version)) {
				librimod.version = config.version;
			}

			if(!librimod.versions.find(version => version.value === config.version)) {
				librimod.versions.push({value: config.version, createdAt: new Date().getTime(), updatedAt: new Date().getTime()});
			}
			else {
				let newVersion = librimod.versions.find(version => version.value === config.version);
				newVersion.updatedAt = new Date().getTime();

				librimod.versions = librimod.versions.map(version => version.value === config.version ? newVersion : version);
			}

			librimod.updatedAt = new Date().getTime();

			await this.collection.findOneAndReplace({name: librimod.name}, librimod);
		}

		let folder = path.join(this.app.root, `data/librimods/${librimod.name}`);

		if(!fs.existsSync(folder) || !(await util.promisify(fs.stat)(folder)).isDirectory()) {
			await util.promisify(fs.mkdir)(folder);
		}

		let file = path.join(folder, `${librimod.name}-${librimod.version}.tar.gz`);

		await util.promisify(fs.writeFile)(file, data);

		return librimod.name;
	}
}