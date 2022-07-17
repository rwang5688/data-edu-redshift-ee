#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DataEduRedshiftEeStack } from '../lib/data-edu-redshift-ee-stack';

const app = new cdk.App();
new DataEduRedshiftEeStack(app, 'DataEduRedshiftEeStack');
